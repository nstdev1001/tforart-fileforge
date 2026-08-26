import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

import { listTasks, listWatchers } from "@/lib/tauri";
import {
  folderWatcherToTask,
  isWatcherChildTask,
} from "@/lib/task-utils";
import { useAppStore } from "@/store/app-store";
import type { FolderWatcher, Task } from "@/types/task";

function requiresImmediateUpdate(current: Task | undefined, next: Task): boolean {
  return (
    !current ||
    current.status !== next.status ||
    current.stage !== next.stage ||
    current.retryCount !== next.retryCount ||
    current.errorMessage !== next.errorMessage ||
    next.progress >= 100
  );
}

export function useTaskEvents() {
  const mergeTasks = useAppStore((state) => state.mergeTasks);
  const upsertTask = useAppStore((state) => state.upsertTask);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const latestTaskEvents = new Map<string, Task>();
    const pendingTaskEvents = new Map<string, Task>();
    const scheduleFrame = window.requestAnimationFrame?.bind(window)
      ?? ((callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
    const cancelFrame = window.cancelAnimationFrame?.bind(window)
      ?? window.clearTimeout.bind(window);
    let scheduledFrame: number | null = null;
    let refreshInFlight: Promise<void> | null = null;

    function flushPendingTaskEvents() {
      scheduledFrame = null;
      const updates = [...pendingTaskEvents.values()];
      pendingTaskEvents.clear();
      updates.forEach(upsertTask);
    }

    function handleTaskEvent(task: Task) {
      if (isWatcherChildTask(task)) return;

      const previous = latestTaskEvents.get(task.id);
      latestTaskEvents.set(task.id, task);
      if (requiresImmediateUpdate(previous, task)) {
        pendingTaskEvents.delete(task.id);
        upsertTask(task);
        return;
      }

      pendingTaskEvents.set(task.id, task);
      if (scheduledFrame === null) {
        scheduledFrame = scheduleFrame(flushPendingTaskEvents);
      }
    }

    function refreshSnapshot(): Promise<void> {
      if (refreshInFlight) return refreshInFlight;
      refreshInFlight = Promise.all([
        listTasks().catch(() => [] as Task[]),
        listWatchers().catch(() => [] as FolderWatcher[]),
      ])
        .then(([tasks, watchers]) => {
          if (disposed) return;
          mergeTasks(
            [
              ...tasks.filter((task) => !isWatcherChildTask(task)),
              ...watchers.map(folderWatcherToTask),
            ],
          );
        })
        .finally(() => {
          refreshInFlight = null;
        });
      return refreshInFlight;
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refreshSnapshot();
    }

    function retainOrDisposeListener(dispose: (() => void) | null) {
      if (!dispose) return;
      if (disposed) dispose();
      else unlisteners.push(dispose);
    }

    async function startListening() {
      await Promise.all([
        listen<Task>("task-progress", (event) => {
          if (!disposed) handleTaskEvent(event.payload);
        }).then(retainOrDisposeListener).catch(() => null),
        listen<FolderWatcher>("watcher-progress", (event) => {
          if (!disposed) upsertTask(folderWatcherToTask(event.payload));
        }).then(retainOrDisposeListener).catch(() => null),
      ]);

      if (disposed) return;

      window.addEventListener("focus", refreshSnapshot);
      document.addEventListener("visibilitychange", refreshWhenVisible);
      await refreshSnapshot();
    }

    void startListening();

    return () => {
      disposed = true;
      if (scheduledFrame !== null) cancelFrame(scheduledFrame);
      pendingTaskEvents.clear();
      window.removeEventListener("focus", refreshSnapshot);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      unlisteners.forEach((dispose) => dispose());
    };
  }, [mergeTasks, upsertTask]);
}
