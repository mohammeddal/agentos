//! Explicit local terminal sessions for the desktop UI.
//! Commands are entered by the user, run in a visible working directory, and never originate
//! from model output. Sessions are memory-only so command history is not persisted to disk.
use serde::Serialize;
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::{
    collections::HashMap,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[cfg(test)]
use std::fs;

const MAX_COMMAND: usize = 8_000;
const MAX_OUTPUT: usize = 1_000_000;
const MAX_SESSIONS: usize = 8;

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalEntry {
    pub at: u64,
    pub stream: String,
    pub text: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSession {
    pub id: String,
    pub title: String,
    pub cwd: String,
    pub status: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub exit_code: Option<i32>,
    pub entries: Vec<TerminalEntry>,
}

#[derive(Default)]
struct Inner {
    home: PathBuf,
    sessions: Vec<TerminalSession>,
    controls: HashMap<String, mpsc::Sender<()>>,
}

#[derive(Clone, Default)]
pub struct Runtime(Arc<Mutex<Inner>>);

impl Runtime {
    pub fn load() -> Result<Self, String> {
        let home = std::env::var("HOME")
            .map(PathBuf::from)
            .map_err(|_| "Your home directory is unavailable.".to_string())?
            .canonicalize()
            .map_err(|e| format!("Your home directory is unavailable: {e}"))?;
        Ok(Self(Arc::new(Mutex::new(Inner {
            home,
            sessions: vec![],
            controls: HashMap::new(),
        }))))
    }

    #[cfg(test)]
    fn with_home(home: PathBuf) -> Self {
        Self(Arc::new(Mutex::new(Inner {
            home,
            sessions: vec![],
            controls: HashMap::new(),
        })))
    }

    fn create(&self, cwd: Option<String>) -> Result<TerminalSession, String> {
        let mut inner = self.0.lock().unwrap();
        if inner.sessions.len() >= MAX_SESSIONS {
            return Err("Close a terminal before opening another one.".into());
        }
        let cwd = resolve_cwd(&inner.home, &inner.home, cwd.as_deref().unwrap_or(""))?;
        let stamp = now();
        let session = TerminalSession {
            id: format!("terminal-{stamp}-{}", inner.sessions.len() + 1),
            title: format!("Terminal {}", inner.sessions.len() + 1),
            cwd: cwd.to_string_lossy().into_owned(),
            status: "idle".into(),
            created_at: stamp,
            updated_at: stamp,
            exit_code: None,
            entries: vec![TerminalEntry {
                at: stamp,
                stream: "system".into(),
                text: "Shell ready.".into(),
            }],
        };
        inner.sessions.push(session.clone());
        Ok(session)
    }

    fn set_cwd(&self, id: &str, cwd: &str) -> Result<TerminalSession, String> {
        let mut inner = self.0.lock().unwrap();
        let current = inner
            .sessions
            .iter()
            .find(|session| session.id == id)
            .map(|session| PathBuf::from(&session.cwd))
            .ok_or("Terminal not found.")?;
        let resolved = resolve_cwd(&inner.home, &current, cwd)?;
        let session = inner
            .sessions
            .iter_mut()
            .find(|session| session.id == id)
            .ok_or("Terminal not found.")?;
        if session.status == "running" {
            return Err("Stop the running command before changing folders.".into());
        }
        session.cwd = resolved.to_string_lossy().into_owned();
        session.updated_at = now();
        Ok(session.clone())
    }

    fn clear(&self, id: &str) -> Result<(), String> {
        let mut inner = self.0.lock().unwrap();
        let session = inner
            .sessions
            .iter_mut()
            .find(|session| session.id == id)
            .ok_or("Terminal not found.")?;
        session.entries.clear();
        session.updated_at = now();
        Ok(())
    }

    fn remove(&self, id: &str) -> Result<(), String> {
        let mut inner = self.0.lock().unwrap();
        if inner.controls.contains_key(id) {
            return Err("Stop the running command before closing this terminal.".into());
        }
        let before = inner.sessions.len();
        inner.sessions.retain(|session| session.id != id);
        if before == inner.sessions.len() {
            return Err("Terminal not found.".into());
        }
        Ok(())
    }

    fn run(&self, id: &str, command: &str) -> Result<TerminalSession, String> {
        let command = command.trim();
        if command.is_empty()
            || command.len() > MAX_COMMAND
            || command.chars().any(|character| character == '\0')
        {
            return Err("Enter a command between 1 and 8,000 characters.".into());
        }
        let mut inner = self.0.lock().unwrap();
        if inner.controls.len() >= 4 {
            return Err("Four terminal commands are already running.".into());
        }
        let session = inner
            .sessions
            .iter_mut()
            .find(|session| session.id == id)
            .ok_or("Terminal not found.")?;
        if session.status == "running" {
            return Err("This terminal is already running a command.".into());
        }
        session.status = "running".into();
        session.exit_code = None;
        session.updated_at = now();
        session.entries.push(TerminalEntry {
            at: now(),
            stream: "input".into(),
            text: command.into(),
        });
        let result = session.clone();
        let (control, cancel) = mpsc::channel();
        inner.controls.insert(id.into(), control);
        drop(inner);

        let runtime = self.clone();
        let id = id.to_string();
        let command = command.to_string();
        thread::spawn(move || {
            let outcome = runtime.execute(&id, &command, &cancel);
            let mut inner = runtime.0.lock().unwrap();
            inner.controls.remove(&id);
            if let Some(session) = inner.sessions.iter_mut().find(|session| session.id == id) {
                session.updated_at = now();
                match outcome {
                    Ok(code) => {
                        session.exit_code = Some(code);
                        session.status = if code == 0 { "completed" } else { "failed" }.into();
                    }
                    Err(error) if error == "Canceled" => {
                        session.status = "canceled".into();
                        session.exit_code = None;
                        push_entry(session, "system", "Command stopped.");
                    }
                    Err(error) => {
                        session.status = "failed".into();
                        session.exit_code = None;
                        push_entry(session, "stderr", &error);
                    }
                }
            }
        });
        Ok(result)
    }

    fn execute(
        &self,
        id: &str,
        command_text: &str,
        cancel: &mpsc::Receiver<()>,
    ) -> Result<i32, String> {
        let cwd = {
            let inner = self.0.lock().unwrap();
            inner
                .sessions
                .iter()
                .find(|session| session.id == id)
                .map(|session| session.cwd.clone())
                .ok_or("Terminal not found.")?
        };
        let shell = std::env::var("SHELL")
            .ok()
            .filter(|value| value.starts_with('/') && Path::new(value).is_file())
            .unwrap_or_else(|| "/bin/zsh".into());
        let mut command = Command::new(shell);
        command
            .args(["-lc", command_text])
            .current_dir(cwd)
            .env("PATH", crate::live_runtime::engine_path())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(unix)]
        command.process_group(0);
        let mut child = command
            .spawn()
            .map_err(|error| format!("Unable to launch the local shell: {error}"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Command output is unavailable.")?;
        let stderr = child
            .stderr
            .take()
            .ok_or("Command diagnostics are unavailable.")?;
        let (output, chunks) = mpsc::channel::<(String, String)>();
        let stdout_worker = read_stream(stdout, "stdout", output.clone());
        let stderr_worker = read_stream(stderr, "stderr", output);
        let mut canceled = false;
        let status = loop {
            while let Ok((stream, text)) = chunks.try_recv() {
                self.append(id, &stream, &text);
            }
            if cancel.try_recv().is_ok() {
                canceled = true;
                #[cfg(unix)]
                terminate_group(child.id());
                let _ = child.kill();
            }
            if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
                break status;
            }
            thread::sleep(Duration::from_millis(30));
        };
        // A one-shot terminal command cannot safely leave background descendants holding its
        // output pipes open. End anything still in the command's dedicated process group.
        #[cfg(unix)]
        terminate_group(child.id());
        let _ = stdout_worker.join();
        let _ = stderr_worker.join();
        while let Ok((stream, text)) = chunks.try_recv() {
            self.append(id, &stream, &text);
        }
        if canceled {
            Err("Canceled".into())
        } else {
            Ok(status.code().unwrap_or(1))
        }
    }

    fn append(&self, id: &str, stream: &str, text: &str) {
        let mut inner = self.0.lock().unwrap();
        let Some(session) = inner.sessions.iter_mut().find(|session| session.id == id) else {
            return;
        };
        push_entry(session, stream, text);
        session.updated_at = now();
    }

    pub fn stop_all(&self) {
        for control in self.0.lock().unwrap().controls.values() {
            let _ = control.send(());
        }
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(3) {
            if self.0.lock().unwrap().controls.is_empty() {
                break;
            }
            thread::sleep(Duration::from_millis(30));
        }
    }
}

#[cfg(unix)]
fn terminate_group(pid: u32) {
    unsafe {
        libc::kill(-(pid as i32), libc::SIGTERM);
    }
    thread::sleep(Duration::from_millis(30));
    unsafe {
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
}

fn read_stream(
    mut reader: impl Read + Send + 'static,
    stream: &'static str,
    output: mpsc::Sender<(String, String)>,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(length) => {
                    if output
                        .send((
                            stream.into(),
                            String::from_utf8_lossy(&buffer[..length]).into_owned(),
                        ))
                        .is_err()
                    {
                        break;
                    }
                }
            }
        }
    })
}

fn push_entry(session: &mut TerminalSession, stream: &str, text: &str) {
    let used: usize = session.entries.iter().map(|entry| entry.text.len()).sum();
    if used >= MAX_OUTPUT {
        return;
    }
    let remaining = MAX_OUTPUT - used;
    let mut text: String = text.chars().take(remaining).collect();
    if text.is_empty() {
        return;
    }
    if let Some(last) = session.entries.last_mut() {
        if last.stream == stream && stream != "input" {
            last.text.push_str(&text);
            last.at = now();
            return;
        }
    }
    if session.entries.len() >= 500 {
        session.entries.remove(0);
    }
    session.entries.push(TerminalEntry {
        at: now(),
        stream: stream.into(),
        text: std::mem::take(&mut text),
    });
}

fn resolve_cwd(home: &Path, current: &Path, input: &str) -> Result<PathBuf, String> {
    if input.len() > 2_000 || input.chars().any(char::is_control) {
        return Err("Enter a valid working directory.".into());
    }
    let path = match input.trim() {
        "" | "~" => home.to_path_buf(),
        value if value.starts_with("~/") => home.join(&value[2..]),
        value if Path::new(value).is_absolute() => PathBuf::from(value),
        value => current.join(value),
    };
    let path = path
        .canonicalize()
        .map_err(|_| "That working directory does not exist or cannot be opened.".to_string())?;
    if !path.is_dir() {
        return Err("The working directory must be a folder.".into());
    }
    Ok(path)
}

#[tauri::command]
pub fn terminal_snapshot(runtime: tauri::State<'_, Runtime>) -> Vec<TerminalSession> {
    runtime.0.lock().unwrap().sessions.clone()
}

#[tauri::command]
pub fn terminal_create(
    runtime: tauri::State<'_, Runtime>,
    cwd: Option<String>,
) -> Result<TerminalSession, String> {
    runtime.create(cwd)
}

#[tauri::command]
pub fn terminal_set_cwd(
    runtime: tauri::State<'_, Runtime>,
    session_id: String,
    cwd: String,
) -> Result<TerminalSession, String> {
    runtime.set_cwd(&session_id, &cwd)
}

#[tauri::command]
pub fn terminal_run(
    runtime: tauri::State<'_, Runtime>,
    session_id: String,
    command: String,
) -> Result<TerminalSession, String> {
    runtime.run(&session_id, &command)
}

#[tauri::command]
pub fn terminal_control(
    runtime: tauri::State<'_, Runtime>,
    session_id: String,
) -> Result<(), String> {
    runtime
        .0
        .lock()
        .unwrap()
        .controls
        .get(&session_id)
        .ok_or("No command is running in this terminal.")?
        .send(())
        .map_err(|_| "The command has already ended.".into())
}

#[tauri::command]
pub fn terminal_clear(
    runtime: tauri::State<'_, Runtime>,
    session_id: String,
) -> Result<(), String> {
    runtime.clear(&session_id)
}

#[tauri::command]
pub fn terminal_remove(
    runtime: tauri::State<'_, Runtime>,
    session_id: String,
) -> Result<(), String> {
    runtime.remove(&session_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_and_canonicalizes_working_directories() {
        let root = std::env::temp_dir().join(format!("agentos-terminal-path-{}", now()));
        fs::create_dir_all(root.join("project")).unwrap();
        let canonical = root.canonicalize().unwrap();
        assert_eq!(resolve_cwd(&canonical, &canonical, "~").unwrap(), canonical);
        assert!(resolve_cwd(&canonical, &canonical, "project").is_ok());
        assert!(resolve_cwd(&canonical, &canonical, "missing").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn runs_a_visible_local_command_and_captures_output() {
        let root = std::env::temp_dir().join(format!("agentos-terminal-run-{}", now()));
        fs::create_dir_all(&root).unwrap();
        let runtime = Runtime::with_home(root.clone());
        let session = runtime.create(None).unwrap();
        runtime.run(&session.id, "printf 'terminal-ready'").unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let snapshot = runtime.0.lock().unwrap().sessions[0].clone();
            if snapshot.status != "running" {
                assert_eq!(snapshot.status, "completed");
                assert_eq!(snapshot.exit_code, Some(0));
                assert!(snapshot
                    .entries
                    .iter()
                    .any(|entry| entry.text.contains("terminal-ready")));
                break;
            }
            assert!(Instant::now() < deadline, "terminal command timed out");
            thread::sleep(Duration::from_millis(20));
        }
        fs::remove_dir_all(root).unwrap();
    }
}
