use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::Manager;

fn valid_folder(path: &str) -> bool {
    let parts: Vec<_> = path.split('/').collect();
    let root = parts[0].strip_prefix("project-").unwrap_or("");
    let segment = |s: &str| {
        !s.is_empty()
            && s.len() <= 100
            && s.bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
    };
    root.len() == 36
        && root
            .bytes()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase() || c == b'-')
        && (parts.len() == 1
            || (parts.len() == 2 && parts[1] == "shared")
            || ((parts.len() == 3 || parts.len() == 5)
                && parts[1] == "domains"
                && segment(parts[2])
                && (parts.len() == 3 || (parts[3] == "agents" && segment(parts[4])))))
}
fn check_dir(path: &Path, create: bool) -> Result<bool, String> {
    if create {
        match fs::create_dir(path) {
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(_) => return Err("Unable to create project directory. Check permissions.".into()),
        }
    }
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => Ok(true),
        Ok(_) => Err("A project path is not a regular directory. Nothing was overwritten.".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err("Unable to access project directory.".into()),
    }
}
fn existing_folders(base: &Path, action: &str, folders: &[String]) -> Result<Vec<String>, String> {
    if !["status", "create", "reveal"].contains(&action)
        || folders.is_empty()
        || folders.len() > 1000
        || !folders.iter().all(|p| valid_folder(p))
        || folders
            .iter()
            .any(|p| p.split('/').next() != folders[0].split('/').next())
        || (action == "reveal" && folders.len() != 1)
    {
        return Err("Invalid project folder request.".into());
    }
    let mut existing = Vec::new();
    for folder in folders {
        let mut path = PathBuf::from(base);
        let mut found = true;
        for part in std::iter::once("projects").chain(folder.split('/')) {
            path.push(part);
            if !check_dir(&path, action == "create")? {
                found = false;
                break;
            }
        }
        if found {
            existing.push(folder.clone());
        }
    }
    Ok(existing)
}
#[tauri::command]
pub fn project_directories(
    app: tauri::AppHandle,
    action: String,
    folders: Vec<String>,
) -> Result<serde_json::Value, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|_| "App data directory unavailable.")?;
    // Tauri owns the app-data base. No user-supplied absolute path is accepted.
    if action == "create" {
        fs::create_dir_all(&base).map_err(|_| "Unable to prepare app data directory.")?;
    }
    if base.exists() && !check_dir(&base, false)? {
        return Err("App data directory unavailable.".into());
    }
    let existing = existing_folders(&base, &action, &folders)?;
    let root = base.join("projects");
    if action == "reveal" {
        if existing.len() != 1 {
            return Err("Create the folder before opening it.".into());
        }
        if !cfg!(target_os = "macos") {
            return Err("Open in Finder is available on macOS. Copy the path instead.".into());
        }
        if !Command::new("/usr/bin/open")
            .arg(root.join(&folders[0]))
            .status()
            .map_err(|_| "Unable to open Finder.")?
            .success()
        {
            return Err("Unable to open Finder.".into());
        }
    }
    Ok(serde_json::json!({ "root": root.to_string_lossy(), "existing": existing }))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_escape_paths() {
        let root = "project-00000000-0000-0000-0000-000000000001";
        assert!(valid_folder(root));
        assert!(valid_folder(&format!("{root}/domains/data/agents/analyst")));
        for suffix in [
            "/../escape",
            "/domains/..",
            "/shared/extra",
            "/domains/a/agents/../escape",
        ] {
            assert!(!valid_folder(&format!("{root}{suffix}")));
        }
    }
    #[test]
    fn creates_only_on_request_and_preserves_files() {
        let base = std::env::temp_dir().join(format!(
            "agentos-project-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&base).unwrap();
        let project = "project-00000000-0000-0000-0000-000000000001";
        let folders = vec![
            project.into(),
            format!("{project}/shared"),
            format!("{project}/domains/data/agents/analyst"),
        ];
        assert!(existing_folders(&base, "status", &folders)
            .unwrap()
            .is_empty());
        assert!(!base.join("projects").exists());
        assert_eq!(
            existing_folders(&base, "create", &folders).unwrap(),
            folders
        );
        let note = base.join("projects").join(project).join("shared/notes.md");
        fs::write(&note, "Preserve this work").unwrap();
        assert_eq!(
            existing_folders(&base, "create", &folders).unwrap(),
            folders
        );
        assert_eq!(fs::read_to_string(&note).unwrap(), "Preserve this work");
        #[cfg(unix)]
        {
            let alias = base.join("projects").join(project).join("domains/alias");
            std::os::unix::fs::symlink(&base, &alias).unwrap();
            assert!(existing_folders(
                &base,
                "create",
                &[format!("{project}/domains/alias/agents/writer")]
            )
            .is_err());
            assert!(!base.join("agents").exists());
        }
        fs::remove_dir_all(&base).unwrap();
    }
}
