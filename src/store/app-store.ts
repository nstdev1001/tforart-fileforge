import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Task } from "@/types/task";

export type AppView = "dashboard" | "tasks" | "watchers" | "history" | "settings";
export type Theme = "light" | "dark" | "system";

interface AppState {
  activeView: AppView;
  sidebarCollapsed: boolean;
  theme: Theme;
  tasks: Task[];
  setActiveView: (view: AppView) => void;
  toggleSidebar: () => void;
  setTheme: (theme: Theme) => void;
  upsertTask: (task: Task) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeView: "dashboard",
      sidebarCollapsed: false,
      theme: "system",
      tasks: [],
      setActiveView: (activeView) => set({ activeView }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setTheme: (theme) => set({ theme }),
      upsertTask: (task) =>
        set((state) => {
          const exists = state.tasks.some((item) => item.id === task.id);
          return {
            tasks: exists
              ? state.tasks.map((item) => (item.id === task.id ? task : item))
              : [task, ...state.tasks],
          };
        }),
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

