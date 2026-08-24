export const TASK_STATUSES = [
  "queued",
  "running",
  "paused",
  "failed",
  "completed",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskKind = "compress-upload" | "download-extract" | "watch-upload";

export interface Task {
  id: string;
  name: string;
  kind: TaskKind;
  status: TaskStatus;
  sourcePath: string;
  destinationPath?: string;
  progress: number;
  bytesProcessed: number;
  bytesTotal: number;
  speedBytesPerSecond?: number;
  etaSeconds?: number;
  retryCount: number;
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

