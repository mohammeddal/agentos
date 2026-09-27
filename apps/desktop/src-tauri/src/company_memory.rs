use std::{fs, io::Write, path::Path, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};
use tauri::Manager;

#[derive(Default)]
pub struct MemoryLock(pub Mutex<()>);

fn read_at(path: &Path) -> Result<Option<String>, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) => {
            if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 2_000_000 { return Err("Memory file is unsafe or too large.".into()); }
            fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
fn replace_file(path: &Path, contents: &str) -> Result<(), String> {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temp = path.with_extension(format!("{stamp}.tmp"));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    let mut file = options.open(&temp).map_err(|e| e.to_string())?;
    file.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    fs::rename(temp, path).map_err(|e| e.to_string())
}
fn save_at(path: &Path, expected: Option<String>, contents: String) -> Result<(), String> {
    if contents.len() > 2_000_000 || !contents.starts_with("# AgentOS company memory\n") { return Err("Invalid or oversized memory document.".into()); }
    if read_at(path)? != expected { return Err("Memory changed on disk. Reload before saving; your changes were not written.".into()); }
    let directory = path.parent().ok_or("Missing memory directory")?;
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    if fs::symlink_metadata(directory).map_err(|e| e.to_string())?.file_type().is_symlink() { return Err("Memory directory must not be a symbolic link.".into()); }
    if let Some(previous) = expected { replace_file(&directory.join("company-memory.previous.md"), &previous)?; }
    replace_file(path, &contents)
}
#[tauri::command]
pub fn read_company_memory(app: tauri::AppHandle, lock: tauri::State<'_, MemoryLock>) -> Result<serde_json::Value, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("memory/company-memory.md");
    Ok(serde_json::json!({"contents": read_at(&path)?, "path": path.to_string_lossy()}))
}
#[tauri::command]
pub fn save_company_memory(app: tauri::AppHandle, lock: tauri::State<'_, MemoryLock>, expected: Option<String>, contents: String) -> Result<serde_json::Value, String> {
    let _guard = lock.0.lock().map_err(|e| e.to_string())?;
    let path = app.path().app_data_dir().map_err(|e| e.to_string())?.join("memory/company-memory.md");
    save_at(&path, expected, contents.clone())?;
    Ok(serde_json::json!({"contents": contents, "path": path.to_string_lossy()}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn persists_backs_up_and_rejects_stale_writes() {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let directory = std::env::temp_dir().join(format!("agentos-memory-test-{stamp}"));
        let path = directory.join("company-memory.md");
        let first = "# AgentOS company memory\nFirst".to_string();
        let second = "# AgentOS company memory\nSecond".to_string();
        assert_eq!(read_at(&path).unwrap(), None);
        save_at(&path, None, first.clone()).unwrap();
        assert!(save_at(&path, None, second.clone()).is_err());
        save_at(&path, Some(first.clone()), second.clone()).unwrap();
        assert_eq!(read_at(&path).unwrap(), Some(second));
        assert_eq!(read_at(&directory.join("company-memory.previous.md")).unwrap(), Some(first));
        fs::remove_dir_all(directory).unwrap();
    }
}
