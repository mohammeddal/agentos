//! Read-only CLI discovery. Never sends a user prompt or starts a model turn.
use crate::live_runtime::{engine_path, executable, Process};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::{
    io::{BufRead, BufReader, Read, Write},
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderModel {
    pub id: String,
    pub name: String,
    pub description: String,
    pub efforts: Vec<String>,
    pub default_effort: Option<String>,
    pub is_default: bool,
}
fn string(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or_default().into()
}
fn normalize(engine: &str, rows: &[Value]) -> Vec<ProviderModel> {
    rows.iter()
        .filter(|v| v["hidden"] != true)
        .filter_map(|v| {
            let codex = engine == "codex";
            let id = string(v, if codex { "model" } else { "value" });
            if id.is_empty() {
                return None;
            }
            let efforts = v[if codex {
                "supportedReasoningEfforts"
            } else {
                "supportedEffortLevels"
            }]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|e| {
                if codex {
                    e["reasoningEffort"].as_str()
                } else {
                    e.as_str()
                }
            })
            .map(str::to_owned)
            .collect();
            Some(ProviderModel {
                name: string(v, "displayName"),
                description: string(v, "description"),
                efforts,
                default_effort: v["defaultReasoningEffort"].as_str().map(str::to_owned),
                is_default: v["isDefault"] == true || (!codex && id == "default"),
                id,
            })
        })
        .collect()
}
pub fn selected(
    models: &[ProviderModel],
    model: Option<&str>,
    effort: Option<&str>,
) -> Result<(String, Option<String>), String> {
    let chosen = if let Some(id) = model {
        models.iter().find(|m| m.id == id)
    } else {
        models.iter().find(|m| m.is_default)
    };
    let chosen =
        chosen.ok_or("Selected model is unavailable. Refresh the model list and choose again.")?;
    if let Some(effort) = effort {
        if !chosen.efforts.iter().any(|e| e == effort) {
            return Err(format!(
                "{effort} effort is not supported by {}. Choose again.",
                chosen.name
            ));
        }
    }
    Ok((
        chosen.id.clone(),
        effort
            .map(str::to_owned)
            .or_else(|| chosen.default_effort.clone()),
    ))
}
pub fn discover(engine: &str) -> Result<Vec<ProviderModel>, String> {
    if !matches!(engine, "codex" | "claude") {
        return Err("Unsupported engine".into());
    }
    let mut command = Command::new(executable(engine)?);
    command
        .current_dir(std::env::temp_dir())
        .env("PATH", engine_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if engine == "codex" {
        command.args(["app-server", "--listen", "stdio://"]);
    } else {
        command.args([
            "--print",
            "--verbose",
            "--output-format",
            "stream-json",
            "--input-format",
            "stream-json",
            "--tools",
            "",
            "--strict-mcp-config",
            "--mcp-config",
            "{\"mcpServers\":{}}",
            "--setting-sources",
            "",
            "--disable-slash-commands",
            "--settings",
            "{\"disableAllHooks\":true}",
        ]);
    }
    #[cfg(unix)]
    command.process_group(0);
    let mut process = Process(command.spawn().map_err(|e| e.to_string())?);
    let mut stdin = process
        .0
        .stdin
        .take()
        .ok_or("Model discovery input unavailable")?;
    let stdout = process
        .0
        .stdout
        .take()
        .ok_or("Model discovery output unavailable")?;
    let stderr = process
        .0
        .stderr
        .take()
        .ok_or("Model discovery diagnostics unavailable")?;
    let (tx, rx) = mpsc::sync_channel(16);
    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut line = String::new();
            match reader.by_ref().take(1_000_001).read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    if line.len() > 1_000_000 || tx.send(line).is_err() {
                        break;
                    }
                }
            }
        }
    });
    thread::spawn(move || {
        let _ = std::io::copy(&mut BufReader::new(stderr), &mut std::io::sink());
    });
    let mut send = |v: Value| -> Result<(), String> {
        writeln!(stdin, "{v}")
            .and_then(|_| stdin.flush())
            .map_err(|e| e.to_string())
    };
    send(if engine == "codex" {
        json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"agentos","version":"0.1.0"}}})
    } else {
        json!({"type":"control_request","request_id":"models","request":{"subtype":"initialize","hooks":null}})
    })?;
    let start = Instant::now();
    let mut result = Vec::new();
    let mut cursors = Vec::new();
    while start.elapsed() < Duration::from_secs(25) {
        let line = match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(line) => line,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(_) => {
                return Err(
                    "Engine closed model discovery. Check its installation and sign-in.".into(),
                )
            }
        };
        let Ok(v) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if v.get("error").is_some() {
            return Err("Engine could not list models. Check its installation and sign-in.".into());
        }
        if engine == "codex" {
            if v["id"] == 1 {
                send(json!({"method":"initialized","params":{}}))?;
                send(
                    json!({"id":2,"method":"model/list","params":{"limit":100,"includeHidden":false}}),
                )?;
            } else if v["id"] == 2 {
                let rows = v["result"]["data"]
                    .as_array()
                    .ok_or("Invalid model catalog")?;
                result.extend(normalize(engine, rows));
                if let Some(cursor) = v["result"]["nextCursor"].as_str() {
                    if cursors.len() >= 20 || cursors.contains(&cursor.to_owned()) {
                        return Err("Invalid model catalog pagination".into());
                    }
                    cursors.push(cursor.to_owned());
                    send(
                        json!({"id":2,"method":"model/list","params":{"limit":100,"includeHidden":false,"cursor":cursor}}),
                    )?;
                } else {
                    break;
                }
            }
        } else if v["type"] == "control_response" {
            let rows = v["response"]["response"]["models"]
                .as_array()
                .ok_or("This Claude CLI did not expose models. Update it and retry.")?;
            result = normalize(engine, rows);
            break;
        }
    }
    if start.elapsed() >= Duration::from_secs(25) {
        return Err("Model discovery timed out. Refresh to retry.".into());
    }
    if result.is_empty() {
        return Err("No models were reported by this engine.".into());
    }
    Ok(result)
}
#[tauri::command]
pub async fn live_models(engine: String) -> Result<Vec<ProviderModel>, String> {
    tauri::async_runtime::spawn_blocking(move || discover(&engine))
        .await
        .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn respects_catalog_and_model_specific_effort() {
        let models = normalize(
            "codex",
            &[
                json!({"model":"test","displayName":"Test","isDefault":true,"supportedReasoningEfforts":[{"reasoningEffort":"low"}],"defaultReasoningEffort":"low"}),
            ],
        );
        assert_eq!(
            selected(&models, None, None).unwrap(),
            ("test".into(), Some("low".into()))
        );
        assert!(selected(&models, Some("missing"), None).is_err());
        assert!(selected(&models, Some("test"), Some("max")).is_err());
        let claude = normalize(
            "claude",
            &[
                json!({"value":"default","displayName":"Default","supportedEffortLevels":["high","max"]}),
                json!({"value":"small","displayName":"Small"}),
            ],
        );
        assert!(selected(&claude, None, Some("max")).is_ok());
        assert!(selected(&claude, Some("small"), Some("high")).is_err());
    }
    #[test]
    #[ignore = "Starts installed CLIs for metadata only; no model turn"]
    fn live_catalog_smoke() {
        for engine in ["codex", "claude"] {
            let models = discover(engine).unwrap();
            assert!(!models.is_empty());
            assert!(selected(&models, None, None).is_ok());
            println!("{engine}: {} models", models.len());
        }
    }
}
