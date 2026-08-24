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
  completed: "Complete",
  failed: "Failed",
};
