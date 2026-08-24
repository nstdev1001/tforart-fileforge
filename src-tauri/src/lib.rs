mod commands;
mod database;

use database::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let database = Database::initialize(app.handle())?;
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pick_folder,
            commands::get_disk_free_space,
            commands::get_database_health,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run FileForge");
}

