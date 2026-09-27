use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

struct Scan {
    entries: Vec<Value>,
    sources: Vec<Value>,
    reads: usize,
    directories: usize,
}
fn object(value: &Value) -> Vec<(String, Value)> {
    value
        .as_object()
        .map(|v| v.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
        .unwrap_or_default()
}
fn text(value: &Value, fallback: &str) -> String {
    let value = value.as_str().unwrap_or(fallback);
    let secret = regex::Regex::new(r"(?i)\b(?:sk-|ghp_|github_pat_)[\w-]{12,}|(?:password|api[_ -]?key|access[_ -]?token|authorization)\s*[:=]\s*\S+").unwrap();
    secret
        .replace_all(value, "[redacted]")
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .take(600)
        .collect()
}
impl Scan {
    fn source(&mut self, path: &Path, status: &str, note: &str) {
        let path = path.to_string_lossy();
        if !self
            .sources
            .iter()
            .any(|s| s["path"] == path.as_ref() && s["status"] == status)
        {
            self.sources
                .push(json!({"path":path,"status":status,"note":note}));
        }
    }
    fn file(&mut self, path: &Path, format: &str) -> Option<Value> {
        self.reads += 1;
        if self.reads > 1500 {
            self.source(path, "error", "Scan limit reached.");
            return None;
        }
        let meta = match fs::symlink_metadata(path) {
            Ok(m) => m,
            Err(e) => {
                self.source(
                    path,
                    if e.kind() == std::io::ErrorKind::NotFound {
                        "missing"
                    } else {
                        "error"
                    },
                    "Source unavailable.",
                );
                return None;
            }
        };
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 1_000_000 {
            self.source(
                path,
                "error",
                "Unsupported, symlinked, or oversized source.",
            );
            return None;
        }
        let parsed = fs::read_to_string(path).ok().and_then(|s| match format {
            "json" => serde_json::from_str::<Value>(&s).ok(),
            "toml" => toml::from_str::<toml::Value>(&s)
                .ok()
                .and_then(|v| serde_json::to_value(v).ok()),
            _ => {
                let normalized = s.replace("\r\n", "\n");
                let front = normalized
                    .strip_prefix("---\n")
                    .and_then(|s| s.split_once("\n---").map(|(front, _)| front))
                    .unwrap_or("");
                serde_yaml::from_str::<Value>(front).ok()
            }
        });
        match parsed {
            Some(v) => {
                self.source(path, "read", "");
                Some(if v.is_object() { v } else { json!({}) })
            }
            None => {
                self.source(path, "error", "Invalid metadata. Contents withheld.");
                None
            }
        }
    }
    fn children(&mut self, path: &Path) -> Vec<String> {
        self.directories += 1;
        if self.directories > 700 {
            self.source(path, "error", "Directory scan limit reached.");
            return vec![];
        }
        match fs::symlink_metadata(path) {
            Ok(m) if m.is_dir() && !m.file_type().is_symlink() => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                self.source(path, "missing", "Directory not present.");
                return vec![];
            }
            _ => {
                self.source(
                    path,
                    "error",
                    "Directory unavailable; symlinks are not followed.",
                );
                return vec![];
            }
        }
        match fs::read_dir(path) {
            Ok(items) => {
                let mut names: Vec<String> = items
                    .filter_map(|e| e.ok())
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .collect();
                names.sort();
                if names.len() > 500 {
                    self.source(path, "error", "Directory limited to 500 entries.");
                    names.truncate(500);
                }
                self.source(path, "read", "");
                names
            }
            Err(_) => {
                self.source(path, "error", "Directory cannot be read.");
                vec![]
            }
        }
    }
    fn add(
        &mut self,
        kind: &str,
        name: &str,
        data: &Value,
        path: &Path,
        scope: &str,
        status: &str,
    ) {
        let id = format!("{kind}:{}:{scope}:{name}", path.display());
        if !self.entries.iter().any(|e| e["id"] == id) {
            self.entries.push(json!({"id":id,"kind":kind,"name":text(&data["name"],name),"description":text(&data["description"],""),"source":path.to_string_lossy(),"scope":scope,"status":status}));
        }
    }
    fn servers(&mut self, value: &Value, path: &Path, scope: &str, status: &str) {
        for (name, d) in object(value) {
            self.add(
                "mcp",
                &name,
                &json!({}),
                path,
                scope,
                if d["enabled"] == false || d["disabled"] == true {
                    "disabled"
                } else {
                    status
                },
            );
        }
    }
    fn skills(&mut self, path: &Path, scope: &str, status: &str, depth: usize) {
        for name in self.children(path) {
            let mut p = path.join(&name);
            if name == ".system" && depth == 0 {
                self.skills(&p, "System", status, 1);
                continue;
            }
            if fs::symlink_metadata(&p)
                .map(|s| s.file_type().is_symlink())
                .unwrap_or(false)
            {
                match p.canonicalize() {
                    Ok(target) => {
                        self.source(
                            &p,
                            "read",
                            &format!("Linked skill folder: {}", target.display()),
                        );
                        p = target;
                    }
                    Err(_) => {
                        self.source(&p, "error", "Skill folder unavailable.");
                        continue;
                    }
                }
            }
            if !fs::symlink_metadata(&p)
                .map(|s| s.is_dir())
                .unwrap_or(false)
            {
                continue;
            }
            let doc = p.join("SKILL.md");
            if let Some(d) = self.file(&doc, "md") {
                self.add("skill", &name, &d, &doc, scope, status);
            }
        }
    }
    fn agents(&mut self, path: &Path, scope: &str, format: &str, status: &str) {
        for name in self.children(path) {
            let extension = format!(".{format}");
            if let Some(stem) = name.strip_suffix(&extension) {
                let p = path.join(&name);
                if let Some(d) = self.file(&p, format) {
                    self.add("agent", stem, &d, &p, scope, status);
                }
            }
        }
    }
    fn config(&mut self, path: &Path, scope: &str) {
        if let Some(d) = self.file(path, "toml") {
            self.servers(&d["mcp_servers"], path, scope, "configured");
            for (name, v) in object(&d["apps"]) {
                if name != "_default" {
                    self.add(
                        "connector",
                        &name,
                        &json!({}),
                        path,
                        scope,
                        if v["enabled"] == false
                            || d["apps"]["_default"]["enabled"] == false && v["enabled"] != true
                        {
                            "disabled"
                        } else {
                            "configured"
                        },
                    );
                }
            }
            for (name, v) in object(&d["agents"]) {
                if v.is_object() {
                    self.add("agent", &name, &v, path, scope, "configured");
                }
            }
            for (name, v) in object(&d["plugins"]) {
                self.add(
                    "plugin",
                    &name,
                    &json!({}),
                    path,
                    scope,
                    if v["enabled"] == false {
                        "disabled"
                    } else {
                        "configured"
                    },
                );
            }
        }
    }
    fn plugin(&mut self, path: &Path, engine: &str, scope: &str, status: &str) {
        if !fs::symlink_metadata(path)
            .map(|s| s.is_dir() && !s.file_type().is_symlink())
            .unwrap_or(false)
        {
            return;
        }
        let data = self.file(&path.join("plugin.json"), "json").or_else(|| {
            self.file(
                &path
                    .join(if engine == "codex" {
                        ".codex-plugin"
                    } else {
                        ".claude-plugin"
                    })
                    .join("plugin.json"),
                "json",
            )
        });
        if let Some(d) = data {
            self.add(
                "plugin",
                &path.file_name().unwrap_or_default().to_string_lossy(),
                &d,
                path,
                scope,
                status,
            );
            self.skills(&path.join("skills"), scope, status, 0);
            self.agents(
                &path.join("agents"),
                scope,
                if engine == "codex" { "toml" } else { "md" },
                status,
            );
            for name in [".mcp.json", "mcp.json"] {
                let p = path.join(name);
                if let Some(m) = self.file(&p, "json") {
                    self.servers(
                        if m["mcpServers"].is_object() {
                            &m["mcpServers"]
                        } else {
                            &m
                        },
                        &p,
                        scope,
                        status,
                    );
                }
            }
            if d["mcpServers"].is_object() {
                self.servers(&d["mcpServers"], path, scope, status);
            }
            let apps_path = path.join(".app.json");
            if let Some(apps) = self.file(&apps_path, "json") {
                for (name, value) in object(&apps["apps"]) {
                    self.add(
                        "connector",
                        &name,
                        &json!({"description":value["description"]}),
                        &apps_path,
                        scope,
                        status,
                    );
                }
            }
        }
    }
}
fn discover(
    engine: &str,
    workspace: Option<PathBuf>,
    home: &Path,
    codex: &Path,
    claude: &Path,
) -> Result<Value, String> {
    if !["codex", "claude", "gemini"].contains(&engine) {
        return Err("Unsupported engine".into());
    }
    let requested_workspace = workspace.clone();
    let workspace = match workspace {
        Some(p) => {
            if !p.is_absolute() || !p.is_dir() {
                return Err("Choose an absolute workspace directory.".into());
            }
            Some(p.canonicalize().map_err(|_| "Workspace unavailable")?)
        }
        None => None,
    };
    let mut scan = Scan {
        entries: vec![],
        sources: vec![],
        reads: 0,
        directories: 0,
    };
    let mut limitations=vec!["Read-only local inventory, not the engine's live session. Configuration does not prove installation, authentication, health, or effective permission.","Managed policies, command-line overrides, inherited parent-folder configuration, remote hosts, and session-only tools are not resolved. Nothing is executed or enabled."];
    if engine == "codex" {
        scan.config(&codex.join("config.toml"), "Personal");
        scan.skills(&codex.join("skills"), "Personal", "found", 0);
        scan.skills(&home.join(".agents/skills"), "Personal", "found", 0);
        scan.agents(&codex.join("agents"), "Personal", "toml", "found");
        if let Some(p) = &workspace {
            scan.config(&p.join(".codex/config.toml"), "Project");
            scan.skills(&p.join(".agents/skills"), "Project", "found", 0);
            scan.skills(&p.join(".codex/skills"), "Project", "found", 0);
            scan.agents(&p.join(".codex/agents"), "Project", "toml", "found");
        }
        let cache = codex.join("plugins/cache");
        for market in scan.children(&cache) {
            for name in scan.children(&cache.join(&market)) {
                for version in scan.children(&cache.join(&market).join(&name)) {
                    scan.plugin(
                        &cache.join(&market).join(&name).join(&version),
                        engine,
                        "Plugin cache",
                        "cached",
                    );
                }
            }
        }
        limitations.push("Plugin cache entries may be inactive or old versions. Nonstandard manifest paths and admin skill directories are not scanned. Connectors show local app configuration and plugin declarations only; the cloud account catalog is not queried.");
    } else if engine == "claude" {
        scan.skills(&claude.join("skills"), "Personal", "found", 0);
        scan.agents(&claude.join("agents"), "Personal", "md", "found");
        let user_path = home.join(".claude.json");
        if let Some(d) = scan.file(&user_path, "json") {
            scan.servers(&d["mcpServers"], &user_path, "Personal", "configured");
            if let Some(p) = &workspace {
                let original = requested_workspace.as_ref().unwrap_or(p);
                let config = if d["projects"][original.to_string_lossy().as_ref()].is_object() {
                    &d["projects"][original.to_string_lossy().as_ref()]
                } else {
                    &d["projects"][p.to_string_lossy().as_ref()]
                };
                scan.servers(
                    &config["mcpServers"],
                    &user_path,
                    "Project local",
                    "configured",
                );
            }
        }
        let mut settings = vec![claude.join("settings.json")];
        if let Some(p) = &workspace {
            scan.skills(&p.join(".claude/skills"), "Project", "found", 0);
            scan.agents(&p.join(".claude/agents"), "Project", "md", "found");
            let m = p.join(".mcp.json");
            if let Some(d) = scan.file(&m, "json") {
                scan.servers(&d["mcpServers"], &m, "Project", "configured");
            }
            settings.push(p.join(".claude/settings.json"));
            settings.push(p.join(".claude/settings.local.json"));
        }
        for (i, p) in settings.iter().enumerate() {
            if let Some(d) = scan.file(p, "json") {
                for (name, enabled) in object(&d["enabledPlugins"]) {
                    scan.add(
                        "plugin",
                        &name,
                        &json!({}),
                        p,
                        if i == 0 { "Personal" } else { "Project" },
                        if enabled == false {
                            "disabled"
                        } else {
                            "configured"
                        },
                    );
                }
            }
        }
        let registry_path = claude.join("plugins/installed_plugins.json");
        if let Some(d) = scan.file(&registry_path, "json") {
            for (name, installs) in object(&d["plugins"]) {
                if let Some(installs) = installs.as_array() {
                    for install in installs {
                        let matches_project = workspace
                            .as_ref()
                            .map(|p| install["projectPath"].as_str() == p.to_str())
                            .unwrap_or(false)
                            || requested_workspace
                                .as_ref()
                                .map(|p| install["projectPath"].as_str() == p.to_str())
                                .unwrap_or(false);
                        if install["scope"] != "user" && !matches_project {
                            continue;
                        }
                        scan.add(
                            "plugin",
                            &name,
                            &json!({}),
                            &registry_path,
                            "Installed registry",
                            "found",
                        );
                        if let Some(path) = install["installPath"].as_str() {
                            let p = PathBuf::from(path);
                            match (claude.join("plugins").canonicalize(),p.canonicalize()) { (Ok(root),Ok(target)) if target.starts_with(&root) => scan.plugin(&target,engine,"Installed plugin","found"), _=>scan.source(&p,"error","Installed plugin path unavailable or outside local plugin directory.") }
                        }
                    }
                }
            }
        }
        limitations.push("Claude cloud connectors and built-in/session agents are not exposed by this local scan. Plugin enablement remains scope-specific; an installed registry entry does not prove the plugin is active.");
    } else {
        limitations = vec!["Gemini discovery is not implemented. No sources were scanned."];
    }
    scan.entries
        .sort_by_key(|v| v["name"].as_str().unwrap_or_default().to_lowercase());
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Invalid clock")?
        .as_millis() as u64;
    Ok(
        json!({"engine":engine,"workspace":workspace.map(|p|p.to_string_lossy().to_string()),"scannedAt":timestamp,"entries":scan.entries,"sources":scan.sources,"limitations":limitations}),
    )
}
#[tauri::command]
pub async fn engine_inventory(engine: String, workspace: Option<String>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or("Home directory unavailable")?;
        let codex = std::env::var_os("CODEX_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".codex"));
        let claude = std::env::var_os("CLAUDE_CONFIG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".claude"));
        discover(
            &engine,
            workspace.map(PathBuf::from),
            &home,
            &codex,
            &claude,
        )
    })
    .await
    .map_err(|_| "Discovery interrupted".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn discovers_without_exposing_config_secrets() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let home = std::env::temp_dir().join(format!("agentos-inventory-test-{stamp}"));
        let codex = home.join(".codex");
        fs::create_dir_all(&codex).unwrap();
        fs::write(codex.join("config.toml"),"[mcp_servers.docs]\ncommand='secret-command'\nenabled=false\n[mcp_servers.docs.env]\nAPI_KEY='secret-value'\n[apps.demo]\nenabled=true\n").unwrap();
        let data = discover("codex", None, &home, &codex, &home.join(".claude")).unwrap();
        let output = data.to_string();
        assert!(!output.contains("secret-command"));
        assert!(!output.contains("secret-value"));
        assert!(data["entries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["name"] == "docs" && e["status"] == "disabled"));
        assert!(data["entries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["kind"] == "connector"));
        fs::write(codex.join("config.toml"), "invalid [ config secret-value").unwrap();
        let data = discover("codex", None, &home, &codex, &home.join(".claude")).unwrap();
        assert!(!data.to_string().contains("secret-value"));
        assert!(data["sources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["status"] == "error"));
        fs::remove_dir_all(home).unwrap();
    }
}
