mod commands;
mod database;
mod desktop;
mod google;
mod seven_zip;
mod task_engine;
mod watcher;

use database::Database;
use google::GoogleService;
use task_engine::TaskEngine;
use tauri::Manager;
use watcher::WatcherService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Loads a local development .env when present. Packaged builds may inject
    // the same values through their process environment.
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .setup(|app| {
            let database = Database::initialize(app.handle())?;
            let concurrent_tasks = database
                .get_setting("concurrent_uploads")?
                .and_then(|value| value.parse::<usize>().ok())
                .unwrap_or(3);
            app.manage(database);
            app.manage(GoogleService::new());
            app.manage(TaskEngine::new(concurrent_tasks));
            app.manage(WatcherService::new());
            app.manage(desktop::DesktopState::new());
            desktop::setup(app)?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                task_engine::recover_unfinished_tasks(handle.clone()).await;
                watcher::restore_enabled_watchers(handle).await;
            });
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
            task_engine::list_task_logs,
            task_engine::get_worker_pool_config,
            task_engine::set_worker_pool_config,
            task_engine::start_compress_upload,
            task_engine::start_download_extract,
            task_engine::pause_task,
            task_engine::resume_task,
            watcher::list_watchers,
            watcher::create_watcher,
            watcher::stop_watcher,
            watcher::restart_watcher,
            watcher::delete_watcher,
            desktop::get_desktop_preferences,
            desktop::set_desktop_preferences,
            desktop::send_test_notification,
        ])
        .on_window_event(desktop::handle_window_event)
        .run(tauri::generate_context!())
        .expect("failed to run FileForge");
}
