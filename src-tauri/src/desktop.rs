use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager, Runtime, State, Window, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_notification::NotificationExt;

use crate::{database::Database, task_engine};

const SETTING_AUTOSTART: &str = "autostart_enabled";
const SETTING_CLOSE_TO_TRAY: &str = "close_to_tray";
const SETTING_NOTIFICATIONS: &str = "notifications_enabled";

pub struct DesktopState {
    quitting: AtomicBool,
}

impl DesktopState {
    pub fn new() -> Self {
        Self {
            quitting: AtomicBool::new(false),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPreferences {
    auto_start: bool,
    close_to_tray: bool,
    notifications_enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDesktopPreferences {
    auto_start: bool,
    close_to_tray: bool,
    notifications_enabled: bool,
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Tforart FileForge", true, None::<&str>)?;
    let pause_all = MenuItem::with_id(app, "pause-all", "Pause All", true, None::<&str>)?;
    let resume_all = MenuItem::with_id(app, "resume-all", "Resume All", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &pause_all, &resume_all, &quit])?;
    let mut builder = TrayIconBuilder::with_id("fileforge-tray")
        .tooltip("Tforart FileForge")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "pause-all" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    task_engine::pause_all(&app).await;
                });
            }
            "resume-all" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    task_engine::resume_all(&app).await;
                });
            }
            "quit" => {
                app.state::<DesktopState>()
                    .quitting
                    .store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;

    if std::env::args().any(|argument| argument == "--background") {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
        }
    } else {
        show_main_window(app.handle());
    }
    Ok(())
}

pub fn handle_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    let app = window.app_handle();
    if app.state::<DesktopState>().quitting.load(Ordering::SeqCst) {
        return;
    }
    let close_to_tray = app
        .state::<Database>()
        .get_setting(SETTING_CLOSE_TO_TRAY)
        .ok()
        .flatten()
        .map_or(true, |value| parse_bool(&value, true));
    if close_to_tray {
        api.prevent_close();
        let _ = window.hide();
    } else {
        app.state::<DesktopState>()
            .quitting
            .store(true, Ordering::SeqCst);
        app.exit(0);
    }
}

#[tauri::command]
pub fn get_desktop_preferences(
    app: AppHandle,
    database: State<'_, Database>,
) -> Result<DesktopPreferences, String> {
    let auto_start = app
        .autolaunch()
        .is_enabled()
        .map_err(|error| error.to_string())?;
    Ok(DesktopPreferences {
        auto_start,
        close_to_tray: setting_bool(&database, SETTING_CLOSE_TO_TRAY, true)?,
        notifications_enabled: setting_bool(&database, SETTING_NOTIFICATIONS, true)?,
    })
}

#[tauri::command]
pub fn set_desktop_preferences(
    request: UpdateDesktopPreferences,
    app: AppHandle,
    database: State<'_, Database>,
) -> Result<DesktopPreferences, String> {
    let autostart = app.autolaunch();
    let auto_start_enabled = autostart.is_enabled().map_err(|error| error.to_string())?;
    if auto_start_enabled != request.auto_start {
        if request.auto_start {
            autostart.enable().map_err(|error| error.to_string())?;
        } else {
            autostart.disable().map_err(|error| error.to_string())?;
        }
    }
    database
        .set_setting(SETTING_AUTOSTART, &request.auto_start.to_string())
        .map_err(|error| error.to_string())?;
    database
        .set_setting(SETTING_CLOSE_TO_TRAY, &request.close_to_tray.to_string())
        .map_err(|error| error.to_string())?;
    database
        .set_setting(
            SETTING_NOTIFICATIONS,
            &request.notifications_enabled.to_string(),
        )
        .map_err(|error| error.to_string())?;
    Ok(DesktopPreferences {
        auto_start: request.auto_start,
        close_to_tray: request.close_to_tray,
        notifications_enabled: request.notifications_enabled,
    })
}

#[tauri::command]
pub fn send_test_notification(app: AppHandle) -> Result<(), String> {
    notify(
        &app,
        "Tforart FileForge notifications are ready",
        "Task completion and failure alerts will appear here.",
    )
}

pub fn notify_task_result(app: &AppHandle, task_name: &str, success: bool, detail: Option<&str>) {
    let title = if success {
        "Tforart FileForge task completed"
    } else {
        "Tforart FileForge task failed"
    };
    let body = if success {
        task_name.to_owned()
    } else {
        format!("{}: {}", task_name, detail.unwrap_or("Unknown error"))
    };
    let _ = notify(app, title, &body);
}

pub fn notify_watcher_result(app: &AppHandle, name: &str, success: bool, detail: Option<&str>) {
    let title = if success {
        "Folder watcher completed"
    } else {
        "Folder watcher stopped with an error"
    };
    let body = detail
        .map(|detail| format!("{name}: {detail}"))
        .unwrap_or_else(|| format!("{name}: all queued uploads have finished"));
    let _ = notify(app, title, &body);
}

fn notify(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    if !setting_bool(&app.state::<Database>(), SETTING_NOTIFICATIONS, true)? {
        return Ok(());
    }
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|error| error.to_string())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn setting_bool(database: &Database, key: &str, default: bool) -> Result<bool, String> {
    database
        .get_setting(key)
        .map_err(|error| error.to_string())
        .map(|value| value.map_or(default, |value| parse_bool(&value, default)))
}

fn parse_bool(value: &str, default: bool) -> bool {
    match value.trim().to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" | "on" => true,
        "false" | "0" | "no" | "off" => false,
        _ => default,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_boolean_settings_accept_common_values() {
        assert!(parse_bool("true", false));
        assert!(parse_bool("1", false));
        assert!(!parse_bool("false", true));
        assert!(!parse_bool("off", true));
        assert!(parse_bool("invalid", true));
    }
}
