mod commands;
mod database;
mod google;
mod seven_zip;
mod task_engine;

use database::Database;
use google::GoogleService;
use task_engine::TaskEngine;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Loads a local development .env when present. Packaged builds may inject
    // the same values through their process environment.
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .setup(|app| {
            let database = Database::initialize(app.handle())?;
            app.manage(database);
            app.manage(GoogleService::new());
            app.manage(TaskEngine::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pick_folder,
            commands::get_disk_free_space,
            commands::get_database_health,
            google::google_auth_status,
            google::google_oauth_login,
            google::google_oauth_logout,
            google::google_drive_test_connection,
            google::google_drive_list_folder,
            google::google_drive_get_metadata,
            google::google_drive_get_web_view_link,
            seven_zip::get_7zip_status,
            seven_zip::set_7zip_path,
            task_engine::list_tasks,
            task_engine::start_compress_upload,
            task_engine::pause_task,
            task_engine::resume_task,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run FileForge");
}
