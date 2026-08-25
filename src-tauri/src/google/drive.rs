use std::{path::Path, sync::Arc, time::Instant};

use reqwest::{header, StatusCode};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use thiserror::Error;
use tokio::{
    fs::{File, OpenOptions},
    io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt},
    sync::Mutex,
    time::{sleep, Duration},
};

use super::{
    oauth::{valid_access_token, OAuthError},
    secure_store::SecureTokenStore,
};
use crate::task_engine::PauseGate;

const DRIVE_API_BASE: &str = "https://www.googleapis.com/drive/v3";
const FILE_FIELDS: &str =
    "id,name,mimeType,size,modifiedTime,createdTime,parents,webViewLink,shared,trashed,capabilities(canDownload)";
const UPLOAD_API_URL: &str = "https://www.googleapis.com/upload/drive/v3/files";
const UPLOAD_CHUNK_SIZE: usize = 8 * 1024 * 1024;
const MAX_UPLOAD_RETRIES: u32 = 5;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub size: Option<String>,
    pub modified_time: Option<String>,
    pub created_time: Option<String>,
    #[serde(default)]
    pub parents: Vec<String>,
    pub web_view_link: Option<String>,
    #[serde(default)]
    pub shared: bool,
    #[serde(default)]
    pub trashed: bool,
    pub capabilities: Option<DriveCapabilities>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveCapabilities {
    pub can_download: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFilePage {
    #[serde(default)]
    pub files: Vec<DriveFile>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveUser {
    pub display_name: String,
    pub email_address: String,
    pub photo_link: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageQuota {
    pub limit: Option<String>,
    pub usage: String,
    pub usage_in_drive: Option<String>,
    pub usage_in_drive_trash: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveConnection {
    pub user: DriveUser,
    pub storage_quota: StorageQuota,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveWebViewLink {
    pub file_id: String,
    pub web_view_link: Option<String>,
}

#[derive(Debug, Error)]
pub enum DriveError {
    #[error(transparent)]
    OAuth(#[from] OAuthError),
    #[error("Google Drive file ID is invalid")]
    InvalidFileId,
    #[error("Google Drive request failed: {0}")]
    Network(#[from] reqwest::Error),
    #[error("local upload file operation failed: {0}")]
    LocalFile(#[from] std::io::Error),
    #[error("Google Drive API returned HTTP {status}: {message}")]
    Api { status: u16, message: String },
    #[error("resumable upload response did not include a session URI")]
    MissingSessionUri,
    #[error("resumable upload session expired")]
    SessionExpired,
    #[error("Google Drive upload ended without returning file metadata")]
    MissingUploadResult,
    #[error("Google Drive download ended before the expected file size")]
    DownloadIncomplete,
}

#[derive(Clone, Debug)]
pub enum UploadEvent {
    SessionCreated(String),
    Progress {
        uploaded_bytes: u64,
        total_bytes: u64,
        speed_bytes_per_second: f64,
        eta_seconds: u64,
    },
    Retry {
        count: u32,
        message: String,
    },
}

#[derive(Clone, Debug)]
pub enum DownloadEvent {
    Progress {
        downloaded_bytes: u64,
        total_bytes: u64,
        speed_bytes_per_second: f64,
        eta_seconds: u64,
    },
    Retry {
        count: u32,
        message: String,
    },
}

pub async fn test_connection(
    http: &reqwest::Client,
    store: &SecureTokenStore,
    refresh_lock: &Mutex<()>,
) -> Result<DriveConnection, DriveError> {
    get_json(
        http,
        store,
        refresh_lock,
        &format!("{DRIVE_API_BASE}/about"),
        &[(
            "fields",
            "user(displayName,emailAddress,photoLink),storageQuota(limit,usage,usageInDrive,usageInDriveTrash)".to_owned(),
        )],
    )
    .await
}

pub async fn list_folder(
    http: &reqwest::Client,
    store: &SecureTokenStore,
    refresh_lock: &Mutex<()>,
    folder_id: Option<String>,
    page_token: Option<String>,
) -> Result<DriveFilePage, DriveError> {
    let folder_id = folder_id.unwrap_or_else(|| "root".to_owned());
    validate_file_id(&folder_id)?;
    let query = format!("'{folder_id}' in parents and trashed = false");
    let mut params = vec![
        ("q", query),
        ("pageSize", "100".to_owned()),
        ("orderBy", "folder,name_natural".to_owned()),
        ("spaces", "drive".to_owned()),
        ("supportsAllDrives", "true".to_owned()),
        ("includeItemsFromAllDrives", "true".to_owned()),
        ("fields", format!("nextPageToken,files({FILE_FIELDS})")),
    ];
    if let Some(page_token) = page_token.filter(|value| !value.trim().is_empty()) {
        params.push(("pageToken", page_token));
    }

    get_json(
        http,
        store,
        refresh_lock,
        &format!("{DRIVE_API_BASE}/files"),
        &params,
    )
    .await
}

pub async fn get_metadata(
    http: &reqwest::Client,
    store: &SecureTokenStore,
    refresh_lock: &Mutex<()>,
    file_id: String,
) -> Result<DriveFile, DriveError> {
    validate_file_id(&file_id)?;
    get_json(
        http,
        store,
        refresh_lock,
        &format!("{DRIVE_API_BASE}/files/{file_id}"),
        &[
            ("fields", FILE_FIELDS.to_owned()),
            ("supportsAllDrives", "true".to_owned()),
        ],
    )
    .await
}

pub async fn get_web_view_link(
    http: &reqwest::Client,
    store: &SecureTokenStore,
    refresh_lock: &Mutex<()>,
    file_id: String,
) -> Result<DriveWebViewLink, DriveError> {
    let metadata = get_metadata(http, store, refresh_lock, file_id.clone()).await?;
    Ok(DriveWebViewLink {
        file_id,
        web_view_link: metadata.web_view_link,
    })
}

#[allow(clippy::too_many_arguments)]
pub async fn download_file(
    http: &reqwest::Client,
    store: &SecureTokenStore,
    refresh_lock: &Mutex<()>,
    file_id: &str,
    destination: &Path,
    total_bytes: u64,
    resume_existing: bool,
    pause_gate: Arc<PauseGate>,
    on_event: Arc<dyn Fn(DownloadEvent) + Send + Sync>,
) -> Result<(), DriveError> {
    validate_file_id(file_id)?;
    let url = format!("{DRIVE_API_BASE}/files/{file_id}");
    let mut output = OpenOptions::new()
        .create(true)
        .truncate(!resume_existing)
        .write(true)
        .open(destination)
        .await?;
    let mut offset = if resume_existing {
        output.metadata().await?.len()
    } else {
        0
    };
    if offset > total_bytes {
        output.set_len(0).await?;
        offset = 0;
    }
    output.seek(std::io::SeekFrom::Start(offset)).await?;
    let mut retry_count = 0_u32;
    let started_at = Instant::now();

    while offset < total_bytes {
        pause_gate.wait().await;
        let bearer_token = access_token(http, store, refresh_lock, false).await?;
        let mut request = http
            .get(&url)
            .query(&[("alt", "media"), ("supportsAllDrives", "true")])
            .bearer_auth(bearer_token);
        if offset > 0 {
            request = request.header(header::RANGE, format!("bytes={offset}-"));
        }

        let response = request.send().await;
        let mut response = match response {
            Ok(response) if response.status() == StatusCode::UNAUTHORIZED => {
                let _ = access_token(http, store, refresh_lock, true).await?;
                retry_count = retry_count.saturating_add(1);
                notify_download_retry(
                    &on_event,
                    retry_count,
                    "access token refreshed during download",
                );
                continue;
            }
            Ok(response)
                if response.status() == StatusCode::RANGE_NOT_SATISFIABLE
                    && offset >= total_bytes =>
            {
                output.flush().await?;
                return Ok(());
            }
            Ok(response) if is_retryable_status(response.status()) => {
                retry_count = retry_count.saturating_add(1);
                if retry_count > MAX_UPLOAD_RETRIES {
                    return api_error(response).await;
                }
                notify_download_retry(
                    &on_event,
                    retry_count,
                    &format!("download returned HTTP {}", response.status()),
                );
                backoff(retry_count, &pause_gate).await;
                continue;
            }
            Ok(response) if response.status().is_success() => response,
            Ok(response) => return api_error(response).await,
            Err(error) => {
                retry_count = retry_count.saturating_add(1);
                if retry_count > MAX_UPLOAD_RETRIES {
                    return Err(DriveError::Network(error));
                }
                notify_download_retry(
                    &on_event,
                    retry_count,
                    "network interruption while starting download range",
                );
                backoff(retry_count, &pause_gate).await;
                continue;
            }
        };

        if offset > 0 && response.status() == StatusCode::OK {
            output.set_len(0).await?;
            output.seek(std::io::SeekFrom::Start(0)).await?;
            offset = 0;
        }

        let mut stream_interrupted = false;
        loop {
            pause_gate.wait().await;
            match response.chunk().await {
                Ok(Some(chunk)) => {
                    output.write_all(&chunk).await?;
                    offset = offset.saturating_add(chunk.len() as u64);
                    emit_download_progress(&on_event, offset, total_bytes, started_at);
                }
                Ok(None) => break,
                Err(error) => {
                    retry_count = retry_count.saturating_add(1);
                    if retry_count > MAX_UPLOAD_RETRIES {
                        return Err(DriveError::Network(error));
                    }
                    notify_download_retry(
                        &on_event,
                        retry_count,
                        "download stream was interrupted; resuming with Range",
                    );
                    output.flush().await?;
                    backoff(retry_count, &pause_gate).await;
                    stream_interrupted = true;
                    break;
                }
            }
        }

        if !stream_interrupted && offset < total_bytes {
            retry_count = retry_count.saturating_add(1);
            if retry_count > MAX_UPLOAD_RETRIES {
                return Err(DriveError::DownloadIncomplete);
            }
            notify_download_retry(
                &on_event,
                retry_count,
                "download ended before the expected file size; resuming",
            );
            backoff(retry_count, &pause_gate).await;
        }
    }

    output.flush().await?;
    Ok(())
}

fn emit_download_progress(
    on_event: &Arc<dyn Fn(DownloadEvent) + Send + Sync>,
    downloaded_bytes: u64,
    total_bytes: u64,
    started_at: Instant,
) {
    let elapsed = started_at.elapsed().as_secs_f64().max(0.001);
    let speed = downloaded_bytes as f64 / elapsed;
    let eta = if speed > 0.0 {
        ((total_bytes.saturating_sub(downloaded_bytes)) as f64 / speed).ceil() as u64
    } else {
        0
    };
    on_event(DownloadEvent::Progress {
        downloaded_bytes,
        total_bytes,
        speed_bytes_per_second: speed,
        eta_seconds: eta,
    });
}

fn notify_download_retry(
    on_event: &Arc<dyn Fn(DownloadEvent) + Send + Sync>,
    count: u32,
    message: &str,
) {
    on_event(DownloadEvent::Retry {
        count,
        message: message.to_owned(),
    });
}

#[allow(clippy::too_many_arguments)]
pub async fn upload_file_resumable(
    http: &reqwest::Client,
    store: &SecureTokenStore,
    refresh_lock: &Mutex<()>,
    archive_path: &Path,
    upload_name: &str,
    drive_folder_id: &str,
    mime_type: &str,
    existing_session_uri: Option<&str>,
    pause_gate: Arc<PauseGate>,
    on_event: Arc<dyn Fn(UploadEvent) + Send + Sync>,
) -> Result<DriveFile, DriveError> {
    validate_file_id(drive_folder_id)?;
    let total_bytes = tokio::fs::metadata(archive_path).await?.len();
    let (session_uri, mut offset) = if let Some(existing) = existing_session_uri {
        match query_upload_status(http, existing, total_bytes).await {
            Ok(UploadStatus::Incomplete(offset)) => (existing.to_owned(), offset),
            Ok(UploadStatus::Complete(file)) => return Ok(file),
            Err(DriveError::SessionExpired) => {
                let session = initiate_resumable_upload(
                    http,
                    store,
                    refresh_lock,
                    upload_name,
                    drive_folder_id,
                    mime_type,
                    total_bytes,
                    pause_gate.clone(),
                    on_event.clone(),
                )
                .await?;
                (session, 0)
            }
            Err(error) => return Err(error),
        }
    } else {
        let session = initiate_resumable_upload(
            http,
            store,
            refresh_lock,
            upload_name,
            drive_folder_id,
            mime_type,
            total_bytes,
            pause_gate.clone(),
            on_event.clone(),
        )
        .await?;
        (session, 0)
    };
    on_event(UploadEvent::SessionCreated(session_uri.clone()));

    let mut file = File::open(archive_path).await?;
    let started_at = Instant::now();
    emit_upload_progress(&on_event, offset, total_bytes, started_at);

    while offset < total_bytes {
        pause_gate.wait().await;
        let length = std::cmp::min(UPLOAD_CHUNK_SIZE as u64, total_bytes - offset) as usize;
        let mut chunk = vec![0_u8; length];
        file.seek(std::io::SeekFrom::Start(offset)).await?;
        file.read_exact(&mut chunk).await?;
        let end = offset + length as u64 - 1;
        let mut retry = 0_u32;

        loop {
            pause_gate.wait().await;
            let bearer_token = access_token(http, store, refresh_lock, false).await?;
            let response = http
                .put(&session_uri)
                .header(header::CONTENT_LENGTH, length)
                .header(
                    header::CONTENT_RANGE,
                    format!("bytes {offset}-{end}/{total_bytes}"),
                )
                .header(header::CONTENT_TYPE, mime_type)
                .bearer_auth(bearer_token)
                .body(chunk.clone())
                .send()
                .await;

            match response {
                Ok(response) if response.status() == StatusCode::PERMANENT_REDIRECT => {
                    offset = next_offset_from_range(response.headers().get(header::RANGE));
                    emit_upload_progress(&on_event, offset, total_bytes, started_at);
                    break;
                }
                Ok(response) if response.status().is_success() => {
                    let uploaded = response.json::<DriveFile>().await?;
                    emit_upload_progress(&on_event, total_bytes, total_bytes, started_at);
                    return Ok(uploaded);
                }
                Ok(response) if response.status() == StatusCode::UNAUTHORIZED && retry == 0 => {
                    let _ = access_token(http, store, refresh_lock, true).await?;
                    retry += 1;
                }
                Ok(response) if is_retryable_status(response.status()) => {
                    retry += 1;
                    if retry > MAX_UPLOAD_RETRIES {
                        return api_error(response).await;
                    }
                    on_event(UploadEvent::Retry {
                        count: retry,
                        message: format!("upload chunk returned HTTP {}", response.status()),
                    });
                    backoff(retry, &pause_gate).await;
                    match query_upload_status(http, &session_uri, total_bytes).await? {
                        UploadStatus::Incomplete(next_offset) => {
                            offset = next_offset;
                            emit_upload_progress(&on_event, offset, total_bytes, started_at);
                            break;
                        }
                        UploadStatus::Complete(file) => return Ok(file),
                    }
                }
                Ok(response) if response.status() == StatusCode::NOT_FOUND => {
                    return Err(DriveError::SessionExpired);
                }
                Ok(response) => return api_error(response).await,
                Err(error) => {
                    retry += 1;
                    if retry > MAX_UPLOAD_RETRIES {
                        return Err(DriveError::Network(error));
                    }
                    on_event(UploadEvent::Retry {
                        count: retry,
                        message: "network interruption while uploading chunk".to_owned(),
                    });
                    backoff(retry, &pause_gate).await;
                    match query_upload_status(http, &session_uri, total_bytes).await? {
                        UploadStatus::Incomplete(next_offset) => {
                            offset = next_offset;
                            emit_upload_progress(&on_event, offset, total_bytes, started_at);
                            break;
                        }
                        UploadStatus::Complete(file) => return Ok(file),
                    }
                }
            }
        }
    }

    Err(DriveError::MissingUploadResult)
}

pub async fn make_file_public(
    http: &reqwest::Client,
    store: &SecureTokenStore,
    refresh_lock: &Mutex<()>,
    file_id: &str,
) -> Result<(), DriveError> {
    validate_file_id(file_id)?;
    let url = format!("{DRIVE_API_BASE}/files/{file_id}/permissions");
    let existing: DrivePermissionPage = get_json(
        http,
        store,
        refresh_lock,
        &url,
        &[
            ("supportsAllDrives", "true".to_owned()),
            ("fields", "permissions(id,type,role)".to_owned()),
        ],
    )
    .await?;
    if existing
        .permissions
        .iter()
        .any(|permission| permission.kind == "anyone" && permission.role == "reader")
    {
        return Ok(());
    }
    for retry in 0..=MAX_UPLOAD_RETRIES {
        let bearer_token = access_token(http, store, refresh_lock, false).await?;
        let response = http
            .post(&url)
            .query(&[("supportsAllDrives", "true"), ("fields", "id")])
            .bearer_auth(bearer_token)
            .json(&serde_json::json!({
                "type": "anyone",
                "role": "reader",
                "allowFileDiscovery": false
            }))
            .send()
            .await?;
        if response.status().is_success() {
            return Ok(());
        }
        if !is_retryable_status(response.status()) || retry == MAX_UPLOAD_RETRIES {
            return api_error(response).await;
        }
        sleep(Duration::from_secs(1_u64 << retry.min(4))).await;
    }
    Err(DriveError::MissingUploadResult)
}

#[derive(Debug, Deserialize)]
struct DrivePermissionPage {
    #[serde(default)]
    permissions: Vec<DrivePermission>,
}

#[derive(Debug, Deserialize)]
struct DrivePermission {
    #[serde(rename = "type")]
    kind: String,
    role: String,
}

#[allow(clippy::too_many_arguments)]
async fn initiate_resumable_upload(
    http: &reqwest::Client,
    store: &SecureTokenStore,
    refresh_lock: &Mutex<()>,
    upload_name: &str,
    drive_folder_id: &str,
    mime_type: &str,
    total_bytes: u64,
    pause_gate: Arc<PauseGate>,
    on_event: Arc<dyn Fn(UploadEvent) + Send + Sync>,
) -> Result<String, DriveError> {
    for retry in 0..=MAX_UPLOAD_RETRIES {
        pause_gate.wait().await;
        let bearer_token = access_token(http, store, refresh_lock, false).await?;
        let response = http
            .post(UPLOAD_API_URL)
            .query(&[
                ("uploadType", "resumable"),
                ("supportsAllDrives", "true"),
                ("fields", FILE_FIELDS),
            ])
            .header("X-Upload-Content-Type", mime_type)
            .header("X-Upload-Content-Length", total_bytes)
            .bearer_auth(bearer_token)
            .json(&serde_json::json!({
                "name": upload_name,
                "mimeType": mime_type,
                "parents": [drive_folder_id]
            }))
            .send()
            .await;

        let response = match response {
            Ok(response) => response,
            Err(_error) if retry < MAX_UPLOAD_RETRIES => {
                let count = retry + 1;
                on_event(UploadEvent::Retry {
                    count,
                    message: "network interruption while creating upload session".to_owned(),
                });
                backoff(count, &pause_gate).await;
                continue;
            }
            Err(error) => return Err(DriveError::Network(error)),
        };

        if response.status().is_success() {
            return response
                .headers()
                .get(header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned)
                .ok_or(DriveError::MissingSessionUri);
        }
        if !is_retryable_status(response.status()) || retry == MAX_UPLOAD_RETRIES {
            return api_error(response).await;
        }
        let count = retry + 1;
        on_event(UploadEvent::Retry {
            count,
            message: "could not create resumable upload session".to_owned(),
        });
        backoff(count, &pause_gate).await;
    }
    Err(DriveError::MissingSessionUri)
}

enum UploadStatus {
    Incomplete(u64),
    Complete(DriveFile),
}

async fn query_upload_status(
    http: &reqwest::Client,
    session_uri: &str,
    total_bytes: u64,
) -> Result<UploadStatus, DriveError> {
    for retry in 0..=MAX_UPLOAD_RETRIES {
        let response = http
            .put(session_uri)
            .header(header::CONTENT_LENGTH, 0)
            .header(header::CONTENT_RANGE, format!("bytes */{total_bytes}"))
            .send()
            .await;
        let response = match response {
            Ok(response) => response,
            Err(_error) if retry < MAX_UPLOAD_RETRIES => {
                sleep(Duration::from_secs(1_u64 << retry.min(4))).await;
                continue;
            }
            Err(error) => return Err(DriveError::Network(error)),
        };
        if response.status() == StatusCode::PERMANENT_REDIRECT {
            return Ok(UploadStatus::Incomplete(next_offset_from_range(
                response.headers().get(header::RANGE),
            )));
        }
        if response.status().is_success() {
            return Ok(UploadStatus::Complete(response.json().await?));
        }
        if response.status() == StatusCode::NOT_FOUND {
            return Err(DriveError::SessionExpired);
        }
        if is_retryable_status(response.status()) && retry < MAX_UPLOAD_RETRIES {
            sleep(Duration::from_secs(1_u64 << retry.min(4))).await;
            continue;
        }
        return api_error(response).await;
    }
    Err(DriveError::MissingUploadResult)
}

fn emit_upload_progress(
    on_event: &Arc<dyn Fn(UploadEvent) + Send + Sync>,
    uploaded_bytes: u64,
    total_bytes: u64,
    started_at: Instant,
) {
    let elapsed = started_at.elapsed().as_secs_f64().max(0.001);
    let speed = uploaded_bytes as f64 / elapsed;
    let eta = if speed > 0.0 {
        ((total_bytes.saturating_sub(uploaded_bytes)) as f64 / speed).ceil() as u64
    } else {
        0
    };
    on_event(UploadEvent::Progress {
        uploaded_bytes,
        total_bytes,
        speed_bytes_per_second: speed,
        eta_seconds: eta,
    });
}

async fn backoff(retry: u32, pause_gate: &PauseGate) {
    let seconds = 1_u64 << retry.saturating_sub(1).min(4);
    sleep(Duration::from_secs(seconds)).await;
    pause_gate.wait().await;
}

fn next_offset_from_range(range: Option<&header::HeaderValue>) -> u64 {
    range
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.rsplit('-').next())
        .and_then(|value| value.parse::<u64>().ok())
        .map(|last| last.saturating_add(1))
        .unwrap_or(0)
}

fn is_retryable_status(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}

async fn api_error<T>(response: reqwest::Response) -> Result<T, DriveError> {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    Err(DriveError::Api {
        status: status.as_u16(),
        message: body.chars().take(600).collect(),
    })
}

async fn get_json<T: DeserializeOwned>(
    http: &reqwest::Client,
    store: &SecureTokenStore,
    refresh_lock: &Mutex<()>,
    url: &str,
    params: &[(&str, String)],
) -> Result<T, DriveError> {
    let bearer_token = access_token(http, store, refresh_lock, false).await?;
    let mut response = http
        .get(url)
        .query(params)
        .bearer_auth(bearer_token)
        .send()
        .await?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        let access_token = access_token(http, store, refresh_lock, true).await?;
        response = http
            .get(url)
            .query(params)
            .bearer_auth(access_token)
            .send()
            .await?;
    }

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let message: String = body.chars().take(600).collect();
        return Err(DriveError::Api {
            status: status.as_u16(),
            message,
        });
    }

    response.json::<T>().await.map_err(DriveError::from)
}

async fn access_token(
    http: &reqwest::Client,
    store: &SecureTokenStore,
    refresh_lock: &Mutex<()>,
    force_refresh: bool,
) -> Result<String, OAuthError> {
    let _guard = refresh_lock.lock().await;
    valid_access_token(http, store, force_refresh).await
}

fn validate_file_id(file_id: &str) -> Result<(), DriveError> {
    let valid = !file_id.is_empty()
        && file_id.len() <= 256
        && file_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'));
    if valid {
        Ok(())
    } else {
        Err(DriveError::InvalidFileId)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drive_ids_accept_google_safe_characters() {
        assert!(validate_file_id("root").is_ok());
        assert!(validate_file_id("1Ab_Cd-9").is_ok());
    }

    #[test]
    fn drive_ids_reject_query_injection() {
        assert!(validate_file_id("root' or trashed = true").is_err());
        assert!(validate_file_id("../secret").is_err());
    }

    #[test]
    fn parses_google_resume_range_as_next_offset() {
        let range = header::HeaderValue::from_static("bytes=0-8388607");
        assert_eq!(next_offset_from_range(Some(&range)), 8_388_608);
        assert_eq!(next_offset_from_range(None), 0);
    }

    #[test]
    fn chunk_size_is_a_google_256_kib_multiple() {
        assert_eq!(UPLOAD_CHUNK_SIZE % (256 * 1024), 0);
    }

    #[test]
    fn public_reader_permission_is_detected_idempotently() {
        let page: DrivePermissionPage = serde_json::from_str(
            r#"{"permissions":[{"id":"one","type":"user","role":"writer"},{"id":"two","type":"anyone","role":"reader"}]}"#,
        )
        .expect("permission response");
        assert!(page
            .permissions
            .iter()
            .any(|permission| permission.kind == "anyone" && permission.role == "reader"));
    }
}
