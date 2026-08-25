import { describe, expect, it } from "vitest";

import {
  folderWatcherToTask,
  isWatcherAggregateTask,
  isWatcherChildTask,
} from "@/lib/task-utils";
import type { FolderWatcher, Task } from "@/types/task";

function createWatcher(status: FolderWatcher["status"] = "draining"): FolderWatcher {
  return {
    id: "render-output",
    name: "Render output",
    localPath: "C:\\Projects\\render-output",
    driveFolderId: "drive-folder",
    driveFolderName: "Final renders",
    enabled: status === "watching" || status === "draining",
    status,
    settlingDelayMs: 3_000,
    includeExtensions: ["jpg", "png"],
    excludePatterns: [],
    autoStopSeconds: 30,
    driveWebViewLink: "https://drive.google.com/drive/folders/drive-folder",
    filesDetected: 8,
    filesUploading: 2,
    filesUploaded: 4,
    filesFailed: 1,
    createdAt: "2026-08-25T08:00:00.000Z",
    updatedAt: "2026-08-25T08:01:00.000Z",
  };
}

describe("folderWatcherToTask", () => {
  it("creates a stable aggregate task with count-based progress", () => {
    const task = folderWatcherToTask(createWatcher());

    expect(task).toMatchObject({
      id: "watcher:render-output",
      name: "Render output",
      kind: "watcher",
      status: "running",
      stage: "uploading",
      progress: 50,
      bytesProcessed: 0,
      bytesTotal: 0,
      filesDetected: 8,
      filesUploading: 2,
      filesUploaded: 4,
      filesFailed: 1,
      driveFolderName: "Final renders",
      driveWebViewLink: "https://drive.google.com/drive/folders/drive-folder",
    });
    expect(isWatcherAggregateTask(task)).toBe(true);
  });

  it.each([
    ["watching", "running", "watching"],
    ["draining", "running", "uploading"],
    ["failed", "failed", "failed"],
  ] as const)("maps %s watcher status to %s/%s", (watcher, status, stage) => {
    const record = createWatcher(watcher);
    record.filesUploading = 0;
    record.filesFailed = 0;

    expect(folderWatcherToTask(record)).toMatchObject({ status, stage });
  });

  it("uses the uploading stage while an active watcher has uploads", () => {
    expect(folderWatcherToTask(createWatcher("watching")).stage).toBe("uploading");
  });

  it("labels a legacy root destination as My Drive", () => {
    const watcher = createWatcher();
    watcher.driveFolderId = "root";
    watcher.driveFolderName = undefined;

    expect(folderWatcherToTask(watcher).driveFolderName).toBe("My Drive");
  });

  it("calculates progress from uploaded files only", () => {
    const watcher = createWatcher();
    watcher.filesDetected = 10;
    watcher.filesUploaded = 3;
    watcher.filesFailed = 4;

    expect(folderWatcherToTask(watcher).progress).toBe(30);
  });

  it("trusts a clean stopped status when failure counters come from an earlier run", () => {
    const watcher = createWatcher("stopped");
    watcher.filesUploaded = 7;

    expect(folderWatcherToTask(watcher)).toMatchObject({
      status: "completed",
      stage: "completed",
      errorMessage: undefined,
    });
  });

  it("describes failed watchers when the backend has no explicit error", () => {
    expect(folderWatcherToTask(createWatcher("failed"))).toMatchObject({
      status: "failed",
      stage: "failed",
      errorMessage: "1 watched file failed to upload.",
    });
  });

  it("marks a fully uploaded stopped watcher as completed", () => {
    const watcher = createWatcher("stopped");
    watcher.filesUploading = 0;
    watcher.filesUploaded = watcher.filesDetected;
    watcher.filesFailed = 0;

    expect(folderWatcherToTask(watcher)).toMatchObject({
      status: "completed",
      stage: "completed",
      progress: 100,
    });
  });

  it("keeps empty watcher progress finite", () => {
    const watcher = createWatcher("watching");
    watcher.filesDetected = 0;
    watcher.filesUploading = 0;
    watcher.filesUploaded = 0;
    watcher.filesFailed = 0;

    expect(folderWatcherToTask(watcher).progress).toBe(0);
  });

  it("keeps an empty stopped watcher stopped at zero progress", () => {
    const watcher = createWatcher("stopped");
    watcher.filesDetected = 0;
    watcher.filesUploading = 0;
    watcher.filesUploaded = 0;
    watcher.filesFailed = 0;

    expect(folderWatcherToTask(watcher)).toMatchObject({
      status: "stopped",
      stage: "stopped",
      progress: 0,
    });
  });
});

describe("watcher task guards", () => {
  it("distinguishes an internal child upload from the aggregate", () => {
    const child = { kind: "watch-upload" } as Task;

    expect(isWatcherChildTask(child)).toBe(true);
    expect(isWatcherAggregateTask(child)).toBe(false);
  });
});
