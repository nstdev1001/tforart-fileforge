mod drive;
mod link;
mod oauth;
mod secure_store;

use std::time::Duration;

use serde::Serialize;
use tauri::State;
use tokio::sync::Mutex;

use drive::{DriveConnection, DriveFile, DriveFilePage, DriveWebViewLink};
use oauth::OAuthLoginResult;
use secure_store::SecureTokenStore;

pub struct GoogleService {
    http: reqwest::Client,
    token_store: SecureTokenStore,
    refresh_lock: Mutex<()>,
}

impl GoogleService {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent(concat!("FileForge/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(600))
            .build()
            .expect("valid Google HTTP client configuration");

        Self {
            http,
            token_store: SecureTokenStore,
            refresh_lock: Mutex::new(()),
        }
    }

    pub(crate) async fn upload_zip_resumable(
        &self,
        archive_path: &std::path::Path,
        upload_name: &str,
        drive_folder_id: &str,
        pause_gate: std::sync::Arc<crate::task_engine::PauseGate>,
        on_event: std::sync::Arc<dyn Fn(drive::UploadEvent) + Send + Sync>,
    ) -> Result<DriveFile, String> {
        drive::upload_zip_resumable(
            &self.http,
            &self.token_store,
            &self.refresh_lock,
            archive_path,
            upload_name,
            drive_folder_id,
            pause_gate,
            on_event,
        )
        .await
        .map_err(|error| error.to_string())
    }

    pub(crate) async fn make_file_public(&self, file_id: &str) -> Result<(), String> {
        drive::make_file_public(&self.http, &self.token_store, &self.refresh_lock, file_id)
            .await
            .map_err(|error| error.to_string())
    }

    pub(crate) async fn metadata(&self, file_id: String) -> Result<DriveFile, String> {
        drive::get_metadata(&self.http, &self.token_store, &self.refresh_lock, file_id)
            .await
            .map_err(|error| error.to_string())
    }

    pub(crate) async fn download_file(
        &self,
        file_id: &str,
        destination: &std::path::Path,
        total_bytes: u64,
        pause_gate: std::sync::Arc<crate::task_engine::PauseGate>,
        on_event: std::sync::Arc<dyn Fn(drive::DownloadEvent) + Send + Sync>,
    ) -> Result<(), String> {
        drive::download_file(
            &self.http,
            &self.token_store,
            &self.refresh_lock,
            file_id,
            destination,
            total_bytes,
            pause_gate,
            on_event,
        )
        .await
        .map_err(|error| error.to_string())
    }
}

pub(crate) use drive::DownloadEvent;
pub(crate) use drive::UploadEvent;
pub(crate) use link::parse_drive_file_id;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAuthStatus {
    configured: bool,
    authenticated: bool,
    secure_storage_available: bool,
    credential_source: &'static str,
}

#[tauri::command]
pub fn google_auth_status(service: State<'_, GoogleService>) -> GoogleAuthStatus {
    GoogleAuthStatus {
        configured: oauth::GoogleConfig::is_configured(),
        authenticated: service.token_store.has_token(),
        secure_storage_available: service.token_store.is_available(),
        credential_source: "environment",
    }
}

#[tauri::command]
pub async fn google_oauth_login(
    service: State<'_, GoogleService>,
) -> Result<OAuthLoginResult, String> {
    oauth::login(&service.http, &service.token_store)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn google_oauth_logout(service: State<'_, GoogleService>) -> Result<(), String> {
    service
        .token_store
        .delete()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn google_drive_test_connection(
    service: State<'_, GoogleService>,
) -> Result<DriveConnection, String> {
    drive::test_connection(&service.http, &service.token_store, &service.refresh_lock)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn google_drive_list_folder(
    folder_id: Option<String>,
    page_token: Option<String>,
    service: State<'_, GoogleService>,
) -> Result<DriveFilePage, String> {
    drive::list_folder(
        &service.http,
        &service.token_store,
        &service.refresh_lock,
        folder_id,
        page_token,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn google_drive_get_metadata(
    file_id: String,
    service: State<'_, GoogleService>,
) -> Result<DriveFile, String> {
    drive::get_metadata(
        &service.http,
        &service.token_store,
        &service.refresh_lock,
        file_id,
    )
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn google_drive_get_web_view_link(
    file_id: String,
    service: State<'_, GoogleService>,
) -> Result<DriveWebViewLink, String> {
    drive::get_web_view_link(
        &service.http,
        &service.token_store,
        &service.refresh_lock,
        file_id,
    )
    .await
    .map_err(|error| error.to_string())
}
