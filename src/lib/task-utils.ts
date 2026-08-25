import type { FolderWatcher, Task, TaskStage, TaskStatus } from "@/types/task";

const watcherStatus: Record<FolderWatcher["status"], TaskStatus> = {
  watching: "running",
  draining: "running",
  stopped: "completed",
  failed: "failed",
};

const watcherStage: Record<FolderWatcher["status"], TaskStage> = {
  watching: "watching",
  draining: "uploading",
  stopped: "completed",
  failed: "failed",
};

function safeCount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

export function folderWatcherToTask(watcher: FolderWatcher): Task {
  const filesDetected = safeCount(watcher.filesDetected);
  const filesUploading = safeCount(watcher.filesUploading);
  const filesUploaded = safeCount(watcher.filesUploaded);
  const filesFailed = safeCount(watcher.filesFailed);
  const uploadedProgress = Math.min(filesDetected, filesUploaded);
  const stoppedWithoutCompletion = watcher.status === "stopped" && filesDetected === 0;
  const errorMessage = watcher.errorMessage
    ?? (watcher.status === "failed" && filesFailed > 0
      ? `${filesFailed} watched file${filesFailed === 1 ? "" : "s"} failed to upload.`
      : undefined);

  return {
    id: `watcher:${watcher.id}`,
    name: watcher.name,
    kind: "watcher",
    status: stoppedWithoutCompletion
      ? "stopped"
      : watcherStatus[watcher.status],
    stage: stoppedWithoutCompletion
      ? "stopped"
      : watcher.status === "watching" && filesUploading > 0
        ? "uploading"
        : watcherStage[watcher.status],
    sourcePath: watcher.localPath,
    destinationPath: watcher.driveFolderId,
    progress: filesDetected > 0 ? (uploadedProgress / filesDetected) * 100 : 0,
    bytesProcessed: 0,
    bytesTotal: 0,
    retryCount: 0,
    errorMessage,
    driveFileId: watcher.driveFolderId,
    driveFolderName: watcher.driveFolderName
      ?? (watcher.driveFolderId === "root" ? "My Drive" : undefined),
    driveWebViewLink: watcher.driveWebViewLink,
    filesDetected,
    filesUploading,
    filesUploaded,
    filesFailed,
    createdAt: watcher.createdAt,
    updatedAt: watcher.updatedAt,
  };
}

export function isWatcherAggregateTask(task: Task): boolean {
  return task.kind === "watcher";
}

export function isWatcherChildTask(task: Task): boolean {
  return task.kind === "watch-upload";
}
