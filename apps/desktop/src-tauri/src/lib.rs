mod attachments;
mod company_memory;
mod engine_inventory;
mod live_runtime;
mod project_directories;
mod provider_models;
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            host_status,
            company_memory::read_company_memory,
            company_memory::save_company_memory,
            engine_inventory::engine_inventory,
            project_directories::project_directories,
            live_runtime::live_snapshot,
            live_runtime::live_engines,
            live_runtime::live_start,
            live_runtime::live_control,
            provider_models::live_models,
            attachments::save_attachment,
            attachments::attachment_preview
        ])
        .build(tauri::generate_context!())
        .expect("error while running StaffForge");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
            app.state::<live_runtime::Runtime>().stop_all();
        }
    });
}
