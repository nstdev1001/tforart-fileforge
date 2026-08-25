import { listen } from "@tauri-apps/api/event";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTaskEvents } from "@/hooks/use-task-events";
import { listTasks, listWatchers } from "@/lib/tauri";
import { useAppStore } from "@/store/app-store";
import type { FolderWatcher, Task } from "@/types/task";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@/lib/tauri", () => ({
  listTasks: vi.fn(),
  listWatchers: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

const regularTask: Task = {
  id: "regular-task",
  name: "Upload project",
  kind: "compress-upload",
  status: "running",
  stage: "uploading",
  sourcePath: "C:\\Projects\\source",
  progress: 50,
  bytesProcessed: 50,
  bytesTotal: 100,
  retryCount: 0,
  createdAt: "2026-08-25T08:00:00.000Z",
  updatedAt: "2026-08-25T08:02:00.000Z",
};

const childTask: Task = {
  ...regularTask,
  id: "watcher-child",
  name: "Auto-upload frame.jpg",
  kind: "watch-upload",
};

const watcher: FolderWatcher = {
  id: "watcher-one",
  name: "Render output",
  localPath: "C:\\Projects\\renders",
  driveFolderId: "drive-folder",
  enabled: true,
  status: "watching",
  settlingDelayMs: 3_000,
  includeExtensions: ["jpg"],
  excludePatterns: [],
  autoStopSeconds: 30,
  driveWebViewLink: "https://drive.google.com/drive/folders/drive-folder",
  filesDetected: 3,
  filesUploading: 1,
  filesUploaded: 1,
  filesFailed: 0,
  createdAt: "2026-08-25T08:00:00.000Z",
  updatedAt: "2026-08-25T08:01:00.000Z",
};

describe("useTaskEvents", () => {
  const handlers = new Map<string, (event: { payload: unknown }) => void>();

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    useAppStore.setState({ tasks: [], removedTaskIds: [] });
    vi.mocked(listTasks).mockResolvedValue([regularTask, childTask]);
    vi.mocked(listWatchers).mockResolvedValue([watcher]);
    vi.mocked(listen).mockImplementation(((eventName: string, handler: (event: { payload: unknown }) => void) => {
      handlers.set(eventName, handler);
      return Promise.resolve(vi.fn());
    }) as unknown as typeof listen);
  });

  it("loads one watcher aggregate, ignores child task events, and upserts watcher progress", async () => {
    renderHook(() => useTaskEvents());

    await waitFor(() => expect(useAppStore.getState().tasks).toHaveLength(2));
    expect(useAppStore.getState().tasks.map((task) => task.id)).toEqual([
      "regular-task",
      "watcher:watcher-one",
    ]);

    act(() => {
      handlers.get("task-progress")?.({ payload: { ...childTask, progress: 90 } });
    });
    expect(useAppStore.getState().tasks).toHaveLength(2);

    act(() => {
      handlers.get("watcher-progress")?.({
        payload: {
          ...watcher,
          filesDetected: 4,
          filesUploading: 2,
          filesUploaded: 2,
          updatedAt: "2026-08-25T08:03:00.000Z",
        },
      });
    });

    const aggregates = useAppStore.getState().tasks.filter((task) => task.kind === "watcher");
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0]).toMatchObject({
      filesDetected: 4,
      filesUploading: 2,
      filesUploaded: 2,
      progress: 50,
    });
  });

  it("does not let a late hydration snapshot overwrite earlier progress events", async () => {
    const tasksSnapshot = deferred<Task[]>();
    const watchersSnapshot = deferred<FolderWatcher[]>();
    vi.mocked(listTasks).mockReturnValue(tasksSnapshot.promise);
    vi.mocked(listWatchers).mockReturnValue(watchersSnapshot.promise);
    renderHook(() => useTaskEvents());

    await waitFor(() => {
      expect(handlers.has("task-progress")).toBe(true);
      expect(handlers.has("watcher-progress")).toBe(true);
    });

    act(() => {
      handlers.get("task-progress")?.({
        payload: {
          ...regularTask,
          progress: 90,
          updatedAt: "2026-08-25T08:04:00.000Z",
        },
      });
      handlers.get("watcher-progress")?.({
        payload: {
          ...watcher,
          filesDetected: 5,
          filesUploading: 3,
          updatedAt: "2026-08-25T08:03:00.000Z",
        },
      });
    });

    await act(async () => {
      tasksSnapshot.resolve([regularTask, childTask]);
      watchersSnapshot.resolve([watcher]);
      await Promise.all([tasksSnapshot.promise, watchersSnapshot.promise]);
    });

    await waitFor(() => {
      const tasks = useAppStore.getState().tasks;
      expect(tasks.find((task) => task.id === "regular-task")).toMatchObject({
        progress: 90,
        updatedAt: "2026-08-25T08:04:00.000Z",
      });
      expect(tasks.find((task) => task.id === "watcher:watcher-one")).toMatchObject({
        filesDetected: 5,
        filesUploading: 3,
        updatedAt: "2026-08-25T08:03:00.000Z",
      });
    });
  });

  it("does not restore a deleted watcher from a late hydration snapshot", async () => {
    const tasksSnapshot = deferred<Task[]>();
    const watchersSnapshot = deferred<FolderWatcher[]>();
    vi.mocked(listTasks).mockReturnValue(tasksSnapshot.promise);
    vi.mocked(listWatchers).mockReturnValue(watchersSnapshot.promise);
    renderHook(() => useTaskEvents());

    act(() => {
      useAppStore.getState().removeTask("watcher:watcher-one");
    });
    await act(async () => {
      tasksSnapshot.resolve([]);
      watchersSnapshot.resolve([watcher]);
      await Promise.all([tasksSnapshot.promise, watchersSnapshot.promise]);
    });

    expect(useAppStore.getState().tasks).toEqual([]);
  });
});
