import { invoke } from "@tauri-apps/api/core";

import type {
  DriveConnection,
  DriveFile,
  DriveFilePage,
  DriveWebViewLink,
  GoogleAuthStatus,
  OAuthLoginResult,
} from "@/types/drive";
import type { DatabaseHealth, DiskSpace } from "@/types/system";
import type { FolderWatcher, Task, TaskLog, WorkerPoolConfig } from "@/types/task";

export interface SevenZipStatus {
  available: boolean;
  path?: string;
  version?: string;
  source?: string;
}

export interface StartCompressUploadRequest {
  sourcePath: string;
  driveFolderId: string;
  archiveName?: string;
  makePublic: boolean;
}

export interface StartDownloadExtractRequest {
  driveLinkOrId: string;
  destinationPath: string;
  createSubfolder: boolean;
}

export interface CreateWatcherRequest {
  name: string;
  localPath: string;
  driveFolderId: string;
  settlingDelayMs: number;
  includeExtensions: string[];
}

export interface DesktopPreferences {
  autoStart: boolean;
  closeToTray: boolean;
  notificationsEnabled: boolean;
}

export interface BandwidthPreferences {
  maximumBandwidth: boolean;
  defaultUploadMbps: number;
  defaultDownloadMbps: number;
}

export async function pickFolder(): Promise<string | null> {
  return invoke<string | null>("pick_folder");
}

export async function getDiskFreeSpace(path: string): Promise<DiskSpace> {
  return invoke<DiskSpace>("get_disk_free_space", { path });
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  return invoke<DatabaseHealth>("get_database_health");
}

export async function getGoogleAuthStatus(): Promise<GoogleAuthStatus> {
  return invoke<GoogleAuthStatus>("google_auth_status");
}

export async function connectGoogleDrive(): Promise<OAuthLoginResult> {
  return invoke<OAuthLoginResult>("google_oauth_login");
}

export async function disconnectGoogleDrive(): Promise<void> {
  return invoke<void>("google_oauth_logout");
}

export async function testGoogleDriveConnection(): Promise<DriveConnection> {
  return invoke<DriveConnection>("google_drive_test_connection");
}

export async function listGoogleDriveFolder(
  folderId?: string,
  pageToken?: string,
): Promise<DriveFilePage> {
  return invoke<DriveFilePage>("google_drive_list_folder", {
    folderId: folderId ?? null,
    pageToken: pageToken ?? null,
  });
}

export async function getGoogleDriveMetadata(fileId: string): Promise<DriveFile> {
  return invoke<DriveFile>("google_drive_get_metadata", { fileId });
}

export async function getGoogleDriveWebViewLink(fileId: string): Promise<DriveWebViewLink> {
  return invoke<DriveWebViewLink>("google_drive_get_web_view_link", { fileId });
}

export async function getSevenZipStatus(): Promise<SevenZipStatus> {
  return invoke<SevenZipStatus>("get_7zip_status");
}

export async function setSevenZipPath(path: string): Promise<SevenZipStatus> {
  return invoke<SevenZipStatus>("set_7zip_path", { path });
}

export async function listTasks(): Promise<Task[]> {
  return invoke<Task[]>("list_tasks");
}

export async function listTaskLogs(taskId: string): Promise<TaskLog[]> {
  return invoke<TaskLog[]>("list_task_logs", { taskId });
}

export async function getWorkerPoolConfig(): Promise<WorkerPoolConfig> {
  return invoke<WorkerPoolConfig>("get_worker_pool_config");
}

export async function setWorkerPoolConfig(concurrentTasks: number): Promise<WorkerPoolConfig> {
  return invoke<WorkerPoolConfig>("set_worker_pool_config", { concurrentTasks });
}

export async function listWatchers(): Promise<FolderWatcher[]> {
  return invoke<FolderWatcher[]>("list_watchers");
}

export async function createWatcher(request: CreateWatcherRequest): Promise<FolderWatcher> {
  return invoke<FolderWatcher>("create_watcher", { request });
}

export async function stopWatcher(watcherId: string): Promise<void> {
  return invoke<void>("stop_watcher", { watcherId });
}

export async function restartWatcher(watcherId: string): Promise<FolderWatcher> {
  return invoke<FolderWatcher>("restart_watcher", { watcherId });
}

export async function deleteWatcher(watcherId: string): Promise<void> {
  return invoke<void>("delete_watcher", { watcherId });
}

export async function getDesktopPreferences(): Promise<DesktopPreferences> {
  return invoke<DesktopPreferences>("get_desktop_preferences");
}

export async function setDesktopPreferences(
  request: DesktopPreferences,
): Promise<DesktopPreferences> {
  return invoke<DesktopPreferences>("set_desktop_preferences", { request });
}

export async function sendTestNotification(): Promise<void> {
  return invoke<void>("send_test_notification");
}

export async function getBandwidthPreferences(): Promise<BandwidthPreferences> {
  return invoke<BandwidthPreferences>("get_bandwidth_preferences");
}

export async function setBandwidthPreferences(
  maximumBandwidth: boolean,
): Promise<BandwidthPreferences> {
  return invoke<BandwidthPreferences>("set_bandwidth_preferences", { maximumBandwidth });
}

export async function startCompressUpload(
  request: StartCompressUploadRequest,
): Promise<Task> {
  return invoke<Task>("start_compress_upload", { request });
}

export async function startDownloadExtract(
  request: StartDownloadExtractRequest,
): Promise<Task> {
  return invoke<Task>("start_download_extract", { request });
}

export async function pauseTask(taskId: string): Promise<Task> {
  return invoke<Task>("pause_task", { taskId });
}

export async function resumeTask(taskId: string): Promise<Task> {
  return invoke<Task>("resume_task", { taskId });
}

export async function retryTask(taskId: string): Promise<Task> {
  return invoke<Task>("retry_task", { taskId });
}
