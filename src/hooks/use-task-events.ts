import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

import { listTasks, listWatchers } from "@/lib/tauri";
import {
  folderWatcherToTask,
  isWatcherChildTask,
} from "@/lib/task-utils";
import { useAppStore } from "@/store/app-store";
import type { FolderWatcher, Task } from "@/types/task";

export function useTaskEvents() {
  const mergeTasks = useAppStore((state) => state.mergeTasks);
  const upsertTask = useAppStore((state) => state.upsertTask);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    Promise.all([
      listTasks().catch(() => [] as Task[]),
      listWatchers().catch(() => [] as FolderWatcher[]),
    ])
      .then(([tasks, watchers]) => {
        if (disposed) return;
        mergeTasks(
          [
            ...tasks.filter((task) => !isWatcherChildTask(task)),
            ...watchers.map(folderWatcherToTask),
          ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
        );
      })
      .catch(() => {
        // Browser-only Vite preview does not expose native task persistence.
      });

    listen<Task>("task-progress", (event) => {
      if (!isWatcherChildTask(event.payload)) upsertTask(event.payload);
    })
      .then((dispose) => {
        if (disposed) dispose();
        else unlisteners.push(dispose);
      })
      .catch(() => {
        // Event listening is only available inside Tauri.
      });

    listen<FolderWatcher>("watcher-progress", (event) => {
      upsertTask(folderWatcherToTask(event.payload));
    })
      .then((dispose) => {
        if (disposed) dispose();
        else unlisteners.push(dispose);
      })
      .catch(() => {
        // Event listening is only available inside Tauri.
      });

    return () => {
      disposed = true;
      unlisteners.forEach((dispose) => dispose());
    };
  }, [mergeTasks, upsertTask]);
}
