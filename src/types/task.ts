export const TASK_STATUSES = [
  "queued",
  "running",
  "waiting_for_network",
  "paused",
  "stopped",
  "failed",
  "completed",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskKind =
  | "compress-upload"
  | "download-extract"
  | "watch-upload"
  | "watcher";
export type TaskStage =
  | "queued"
  | "watching"
  | "compressing"
  | "uploading"
  | "sharing"
  | "downloading"
  | "inspecting"
  | "extracting"
  | "opening"
  | "stopped"
  | "completed"
  | "failed";

export interface Task {
  id: string;
  name: string;
  kind: TaskKind;
  status: TaskStatus;
  stage: TaskStage;
  sourcePath: string;
  destinationPath?: string;
  progress: number;
  bytesProcessed: number;
  bytesTotal: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
  retryCount: number;
  errorMessage?: string;
  driveFileId?: string;
  driveFolderName?: string;
  driveWebViewLink?: string;
  filesDetected?: number;
  filesUploading?: number;
  filesUploaded?: number;
  filesFailed?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLog {
  id: number;
  taskId?: string;
  level: "trace" | "debug" | "info" | "warn" | "error";
  event: string;
  message: string;
  contextJson?: string;
  createdAt: string;
}

export interface WorkerPoolConfig {
  concurrentTasks: number;
  activeTasks: number;
}

export type WatcherStatus = "watching" | "draining" | "stopped" | "failed";

export interface FolderWatcher {
  id: string;
  name: string;
  localPath: string;
  driveFolderId?: string;
  driveFolderName?: string;
  enabled: boolean;
  status: WatcherStatus;
  settlingDelayMs: number;
  includeExtensions: string[];
  excludePatterns: string[];
  autoStopSeconds: number;
  lastActivityAt?: string;
  driveWebViewLink?: string;
  filesDetected: number;
  filesUploading: number;
  filesUploaded: number;
  filesFailed: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export const taskStatusLabel: Record<TaskStatus, string> = {
  queued: "Queued",
  running: "Running",
  waiting_for_network: "Waiting for network",
  paused: "Paused",
  stopped: "Stopped",
  failed: "Failed",
  completed: "Completed",
};

export const taskStageLabel: Record<TaskStage, string> = {
  queued: "Waiting",
  watching: "Watching",
  compressing: "Compressing",
  uploading: "Uploading",
  sharing: "Creating share link",
  downloading: "Downloading",
  inspecting: "Validating ZIP",
  extracting: "Extracting",
  opening: "Opening folder",
  stopped: "Stopped",
  completed: "Complete",
  failed: "Failed",
};
