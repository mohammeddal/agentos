use std::{
    fs,
    io::Write,
    path::Path,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Clone, serde::Deserialize, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryDocument {
    path: String,
    contents: String,
}

#[derive(Default)]
pub struct MemoryLock(pub Mutex<()>);

fn read_at(path: &Path) -> Result<Option<String>, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) => {
            if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 2_000_000 {
                return Err("Memory file is unsafe or too large.".into());
            }
            fs::read_to_string(path)
                .map(Some)
                .map_err(|e| e.to_string())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
fn replace_file(path: &Path, contents: &str) -> Result<(), String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let temp = path.with_extension(format!("{stamp}.tmp"));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temp).map_err(|e| e.to_string())?;
    file.write_all(contents.as_bytes())
        .map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    fs::rename(temp, path).map_err(|e| e.to_string())
}
fn save_at(path: &Path, expected: Option<String>, contents: String) -> Result<(), String> {
    if contents.len() > 2_000_000 || !contents.starts_with("# AgentOS company memory\n") {
        return Err("Invalid or oversized memory document.".into());
    }
    if read_at(path)? != expected {
        return Err(
            "Memory changed on disk. Reload before saving; your changes were not written.".into(),
        );
    }
    let directory = path.parent().ok_or("Missing memory directory")?;
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    if fs::symlink_metadata(directory)
        .map_err(|e| e.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("Memory directory must not be a symbolic link.".into());
    }
    if let Some(previous) = expected {
        replace_file(&directory.join("company-memory.previous.md"), &previous)?;
    }
    replace_file(path, &contents)
}
fn read_documents(directory: &Path) -> Result<Vec<MemoryDocument>, String> {
    let mut result = Vec::new();
    let index = directory.join("MEMORY.md");
    if let Some(contents) = read_at(&index)? {
        result.push(MemoryDocument {
            path: "MEMORY.md".into(),
            contents,
        });
    }
    for folder in ["main", "offices", "agents"] {
        let root = directory.join(folder);
        let entries = match fs::read_dir(&root) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        };
        let mut paths = entries
            .filter_map(Result::ok)
            .map(|item| item.path())
            .collect::<Vec<_>>();
        paths.sort();
        for path in paths {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("");
            if !name.ends_with(".md")
                || !name[..name.len() - 3]
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            {
                continue;
            }
            if let Some(contents) = read_at(&path)? {
                if contents.len() > 200_000 {
                    return Err("Memory document is too large.".into());
                }
                result.push(MemoryDocument {
                    path: format!("{folder}/{name}"),
                    contents,
                });
            }
        }
    }
    Ok(result)
}
fn valid_document(document: &MemoryDocument) -> bool {
    let valid_path = document.path == "MEMORY.md" || {
        let parts = document.path.split('/').collect::<Vec<_>>();
        parts.len() == 2
            && ["main", "offices", "agents"].contains(&parts[0])
            && parts[1].ends_with(".md")
            && parts[1][..parts[1].len() - 3]
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    };
    valid_path
        && document.contents.len() <= 200_000
        && if document.path == "MEMORY.md" {
            document.contents.starts_with("# AgentOS memory\n")
        } else {
            document
                .contents
                .starts_with("<!-- agentos-memory-entry-v1\n")
        }
}
#[tauri::command]
pub fn read_company_memory(
    app: tauri::AppHandle,
    lock: tauri::State<'_, MemoryLock>,
) -> Result<serde_json::Value, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("memory");
    let path = directory.join("company-memory.md");
    Ok(
        serde_json::json!({"contents": read_at(&path)?, "path": path.to_string_lossy(), "directory": directory.to_string_lossy(), "documents": read_documents(&directory)?}),
    )
}
#[tauri::command]
pub fn save_company_memory(
    app: tauri::AppHandle,
    lock: tauri::State<'_, MemoryLock>,
    expected: Option<String>,
    contents: String,
    expected_documents: Vec<MemoryDocument>,
    documents: Vec<MemoryDocument>,
) -> Result<serde_json::Value, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("memory");
    let path = directory.join("company-memory.md");
    if read_documents(&directory)? != expected_documents {
        return Err("A Markdown memory file changed on disk. Reload before saving.".into());
    }
    if documents.len() > 501 || !documents.iter().all(valid_document) {
        return Err("Invalid memory document.".into());
    }
    let retained = documents
        .iter()
        .map(|document| document.path.clone())
        .collect::<std::collections::HashSet<_>>();
    save_at(&path, expected, contents.clone())?;
    for document in documents {
        let destination = directory.join(&document.path);
        fs::create_dir_all(destination.parent().ok_or("Missing memory folder")?)
            .map_err(|e| e.to_string())?;
        replace_file(&destination, &document.contents)?;
    }
    for previous in read_documents(&directory)? {
        if previous.path != "MEMORY.md" && !retained.contains(&previous.path) {
            fs::remove_file(directory.join(previous.path)).map_err(|e| e.to_string())?;
        }
    }
    Ok(
        serde_json::json!({"contents": contents, "path": path.to_string_lossy(), "directory": directory.to_string_lossy(), "documents": read_documents(&directory)?}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persists_backs_up_and_rejects_stale_writes() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("agentos-memory-test-{stamp}"));
        let path = directory.join("company-memory.md");
        let first = "# AgentOS company memory\nFirst".to_string();
        let second = "# AgentOS company memory\nSecond".to_string();
        assert_eq!(read_at(&path).unwrap(), None);
        save_at(&path, None, first.clone()).unwrap();
        assert!(save_at(&path, None, second.clone()).is_err());
        save_at(&path, Some(first.clone()), second.clone()).unwrap();
        assert_eq!(read_at(&path).unwrap(), Some(second));
        assert_eq!(
            read_at(&directory.join("company-memory.previous.md")).unwrap(),
            Some(first)
        );
        fs::remove_dir_all(directory).unwrap();
    }
}
