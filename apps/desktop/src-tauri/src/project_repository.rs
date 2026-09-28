//! Codex-style projects: a project points at a folder the user chose, optionally on a git branch.
//! Work on a branch other than the checked-out one runs in an app-owned git worktree, so the
//! user's own checkout is never switched underneath them.
use serde::Serialize;
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInfo {
    pub path: String,
    pub git: bool,
    pub current_branch: String,
    pub branches: Vec<String>,
}

pub fn resolve_directory(input: &str) -> Result<PathBuf, String> {
    let path = Path::new(input.trim());
    if !path.is_absolute() {
        return Err("Choose a project folder with an absolute path.".into());
    }
    let path = path
        .canonicalize()
        .map_err(|_| "The project folder does not exist or cannot be opened.".to_string())?;
    if !path.is_dir() {
        return Err("The project path must be a folder.".into());
    }
    Ok(path)
}

fn git(dir: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn inspect(input: &str) -> Result<RepositoryInfo, String> {
    let dir = resolve_directory(input)?;
    let is_git = git(&dir, &["rev-parse", "--is-inside-work-tree"]).as_deref() == Some("true");
    let (current_branch, branches) = if is_git {
        (
            git(&dir, &["branch", "--show-current"]).unwrap_or_default(),
            git(&dir, &["branch", "--format=%(refname:short)"])
                .unwrap_or_default()
                .lines()
                .map(str::to_string)
                .filter(|b| !b.is_empty())
                .collect(),
        )
    } else {
        (String::new(), vec![])
    };
    Ok(RepositoryInfo {
        path: dir.to_string_lossy().into_owned(),
        git: is_git,
        current_branch,
        branches,
    })
}

pub fn valid_branch(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 200
        && !name.starts_with(['-', '/', '.'])
        && !name.ends_with(['/', '.'])
        && !name.contains("..")
        && !name.contains("//")
        && !name.ends_with(".lock")
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.' | b'/'))
}

/// The folder a run should use: the project folder, or a worktree when another branch is chosen.
pub fn workspace(base: &Path, directory: &str, branch: &str) -> Result<PathBuf, String> {
    let dir = resolve_directory(directory)?;
    if branch.is_empty() {
        return Ok(dir);
    }
    if !valid_branch(branch) {
        return Err("Invalid branch name.".into());
    }
    let info = inspect(directory)?;
    if !info.git {
        return Err("This project folder is not a git repository, so it has no branches.".into());
    }
    if info.current_branch == branch {
        return Ok(dir);
    }
    if !info.branches.iter().any(|b| b == branch) {
        return Err(format!(
            "Branch “{branch}” was not found in this repository."
        ));
    }
    let mut hasher = DefaultHasher::new();
    dir.hash(&mut hasher);
    let worktree = base.join("worktrees").join(format!(
        "{:016x}-{}",
        hasher.finish(),
        branch.replace('/', "-")
    ));
    if worktree.exists() {
        let meta = fs::symlink_metadata(&worktree).map_err(|e| e.to_string())?;
        if !meta.is_dir() || meta.file_type().is_symlink() {
            return Err("The branch worktree path is not a regular folder.".into());
        }
        return Ok(worktree);
    }
    fs::create_dir_all(worktree.parent().unwrap()).map_err(|e| e.to_string())?;
    let output = Command::new("git")
        .arg("-C")
        .arg(&dir)
        .args(["worktree", "add"])
        .arg(&worktree)
        .arg(branch)
        .output()
        .map_err(|e| format!("Could not run git: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "Could not prepare branch “{branch}”: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(worktree)
}

fn pick_folder() -> Result<Option<String>, String> {
    let output = Command::new("osascript")
        .args([
            "-e",
            "POSIX path of (choose folder with prompt \"Choose a project folder\")",
        ])
        .output()
        .map_err(|e| format!("Could not open the folder picker: {e}"))?;
    if !output.status.success() {
        // Cancelling the picker is not an error.
        return Ok(None);
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!path.is_empty()).then_some(path))
}

#[tauri::command]
pub fn project_repository(action: String, path: String) -> Result<Option<RepositoryInfo>, String> {
    match action.as_str() {
        "pick" => match pick_folder()? {
            Some(chosen) => inspect(&chosen).map(Some),
            None => Ok(None),
        },
        "inspect" => inspect(&path).map(Some),
        _ => Err("Unknown project folder action.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_branch_names() {
        for name in ["main", "feature/login", "release-1.2", "fix_bug"] {
            assert!(valid_branch(name), "{name}");
        }
        for name in [
            "", "-x", "a..b", "a//b", "a/", ".hidden", "x.lock", "a b", "a;rm",
        ] {
            assert!(!valid_branch(name), "{name}");
        }
    }

    #[test]
    fn inspects_git_repositories_and_uses_worktrees_for_other_branches() {
        let root = std::env::temp_dir().join(format!("agentos-repo-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let repo = root.join("repo");
        fs::create_dir_all(&repo).unwrap();
        let run = |args: &[&str]| {
            assert!(Command::new("git")
                .arg("-C")
                .arg(&repo)
                .args(args)
                .output()
                .unwrap()
                .status
                .success())
        };
        run(&["init", "-q", "-b", "main"]);
        run(&[
            "-c",
            "user.email=a@b",
            "-c",
            "user.name=t",
            "commit",
            "-q",
            "--allow-empty",
            "-m",
            "i",
        ]);
        run(&["branch", "feature/x"]);
        let path = repo.to_string_lossy();
        let info = inspect(&path).unwrap();
        assert!(info.git);
        assert_eq!(info.current_branch, "main");
        assert!(info.branches.contains(&"feature/x".to_string()));
        let base = root.join("runtime");
        assert_eq!(
            workspace(&base, &path, "").unwrap(),
            repo.canonicalize().unwrap()
        );
        assert_eq!(
            workspace(&base, &path, "main").unwrap(),
            repo.canonicalize().unwrap()
        );
        let worktree = workspace(&base, &path, "feature/x").unwrap();
        assert!(worktree.starts_with(base.join("worktrees")));
        assert!(worktree.join(".git").exists());
        assert_eq!(workspace(&base, &path, "feature/x").unwrap(), worktree);
        assert!(workspace(&base, &path, "missing").is_err());
        assert!(workspace(&base, "relative/path", "").is_err());
        let _ = fs::remove_dir_all(&root);
    }
}
