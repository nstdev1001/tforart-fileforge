import { create } from "zustand";
import { persist } from "zustand/middleware";

import { mergeRecordsByUpdatedAt } from "@/lib/record-utils";
import type { Task } from "@/types/task";

export type AppView = "dashboard" | "tasks" | "watchers" | "history" | "settings";
export type Theme = "light" | "dark" | "system";

interface AppState {
  activeView: AppView;
  sidebarCollapsed: boolean;
  theme: Theme;
  tasks: Task[];
  removedTaskIds: string[];
  setActiveView: (view: AppView) => void;
  toggleSidebar: () => void;
  setTheme: (theme: Theme) => void;
  mergeTasks: (tasks: Task[]) => void;
  upsertTask: (task: Task) => void;
  removeTask: (taskId: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeView: "dashboard",
      sidebarCollapsed: false,
      theme: "system",
      tasks: [],
      removedTaskIds: [],
      setActiveView: (activeView) => set({ activeView }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setTheme: (theme) => set({ theme }),
      mergeTasks: (tasks) =>
        set((state) => ({
          tasks: mergeRecordsByUpdatedAt(
            state.tasks,
            tasks.filter((task) => !state.removedTaskIds.includes(task.id)),
          ),
        })),
      upsertTask: (task) =>
        set((state) => state.removedTaskIds.includes(task.id)
          ? state
          : { tasks: mergeRecordsByUpdatedAt(state.tasks, [task], true) }),
      removeTask: (taskId) =>
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== taskId),
          removedTaskIds: state.removedTaskIds.includes(taskId)
            ? state.removedTaskIds
            : [...state.removedTaskIds, taskId],
        })),
    }),
    {
      name: "fileforge-preferences",
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);
