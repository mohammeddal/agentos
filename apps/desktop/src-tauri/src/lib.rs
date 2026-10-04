mod attachments;
mod company_memory;
mod engine_inventory;
mod live_runtime;
mod project_directories;
mod project_repository;
mod provider_models;
mod terminal_runtime;
use tauri::Manager;

#[tauri::command]
fn host_status() -> serde_json::Value {
    serde_json::json!({
        "host": "tauri",
        "local": true,
        "credentialStorage": "codex-owned"
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(company_memory::MemoryLock::default())
        .setup(|app| {
            app.manage(live_runtime::setup(app.handle())?);
            app.manage(terminal_runtime::Runtime::load()?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            host_status,
            company_memory::read_company_memory,
            company_memory::save_company_memory,
            engine_inventory::engine_inventory,
            project_directories::project_directories,
            project_repository::project_repository,
            live_runtime::live_snapshot,
            live_runtime::live_engines,
            live_runtime::live_start,
            live_runtime::live_control,
            live_runtime::live_reveal,
            provider_models::live_models,
            attachments::save_attachment,
            attachments::attachment_preview,
            terminal_runtime::terminal_snapshot,
            terminal_runtime::terminal_create,
            terminal_runtime::terminal_set_cwd,
            terminal_runtime::terminal_run,
            terminal_runtime::terminal_control,
            terminal_runtime::terminal_clear,
            terminal_runtime::terminal_remove
        ])
        .build(tauri::generate_context!())
        .expect("error while running StaffForge");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
            app.state::<live_runtime::Runtime>().stop_all();
            app.state::<terminal_runtime::Runtime>().stop_all();
        }
    });
}
