import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

import { listTasks } from "@/lib/tauri";
import { useAppStore } from "@/store/app-store";
import type { Task } from "@/types/task";

export function useTaskEvents() {
  const setTasks = useAppStore((state) => state.setTasks);
  const upsertTask = useAppStore((state) => state.upsertTask);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    listTasks()
      .then((tasks) => {
        if (!disposed) setTasks(tasks);
      })
      .catch(() => {
        // Browser-only Vite preview does not expose native task persistence.
      });

    listen<Task>("task-progress", (event) => upsertTask(event.payload))
      .then((dispose) => {
        if (disposed) dispose();
        else unlisten = dispose;
      })
      .catch(() => {
        // Event listening is only available inside Tauri.
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [setTasks, upsertTask]);
}

