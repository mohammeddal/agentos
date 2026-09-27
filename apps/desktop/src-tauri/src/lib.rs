mod company_memory;
mod engine_inventory;
mod project_directories;

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
    tauri::Builder::default()
        .manage(company_memory::MemoryLock::default())
        .invoke_handler(tauri::generate_handler![host_status, company_memory::read_company_memory, company_memory::save_company_memory, engine_inventory::engine_inventory, project_directories::project_directories])
        .run(tauri::generate_context!())
        .expect("error while running StaffForge");
}
