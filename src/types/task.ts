export const TASK_STATUSES = [
  "queued",
  "running",
  "paused",
  "failed",
  "completed",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskKind = "compress-upload" | "download-extract" | "watch-upload";
export type TaskStage =
  | "queued"
  | "compressing"
  | "uploading"
  | "sharing"
  | "downloading"
  | "inspecting"
  | "extracting"
  | "opening"
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
  driveWebViewLink?: string;
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
  enabled: boolean;
  status: WatcherStatus;
  settlingDelayMs: number;
  includeExtensions: string[];
  excludePatterns: string[];
  autoStopSeconds: number;
  lastActivityAt?: string;
  driveWebViewLink?: string;
  filesDetected: number;
  filesUploaded: number;
  filesFailed: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export const taskStatusLabel: Record<TaskStatus, string> = {
  queued: "Queued",
  running: "Running",
  paused: "Paused",
  failed: "Failed",
  completed: "Completed",
};

export const taskStageLabel: Record<TaskStage, string> = {
  queued: "Waiting",
  compressing: "Compressing",
  uploading: "Uploading",
  sharing: "Creating share link",
  downloading: "Downloading",
  inspecting: "Validating ZIP",
  extracting: "Extracting",
  opening: "Opening folder",
  completed: "Complete",
  failed: "Failed",
};
