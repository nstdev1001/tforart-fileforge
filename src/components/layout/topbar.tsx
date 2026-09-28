import { Bell, Moon, Search, Sparkles, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AppView, useAppStore } from "@/store/app-store";
import { useUpdaterStore } from "@/store/updater-store";

const viewTitles: Record<AppView, { title: string; subtitle: string }> = {
  dashboard: { title: "Good morning", subtitle: "Here's what's happening with your files." },
  tasks: { title: "Tasks", subtitle: "Track every compression, transfer, and extraction." },
  watchers: { title: "Watchers", subtitle: "Automate uploads from folders you choose." },
  history: { title: "History", subtitle: "Review completed work and task logs." },
  settings: { title: "Settings", subtitle: "Configure Tforart FileForge for your workflow." },
};

export function Topbar() {
  const activeView = useAppStore((state) => state.activeView);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const status = useUpdaterStore((state) => state.status);
  const updateInfo = useUpdaterStore((state) => state.updateInfo);
  const setModalOpen = useUpdaterStore((state) => state.setModalOpen);
  const current = viewTitles[activeView];

  const hasUpdate = (status === "available" || status === "downloaded") && Boolean(updateInfo);

  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <header className="flex h-[92px] shrink-0 items-center justify-between gap-5 border-b border-border/70 px-7" data-tauri-drag-region>
      <div className="min-w-0" data-tauri-drag-region>
        <h1 className="truncate text-xl font-semibold tracking-tight">{current.title}</h1>
        <p className="mt-1 truncate text-xs text-muted-foreground">{current.subtitle}</p>
      </div>

      <div className="flex items-center gap-2" data-tauri-drag-region="false">
        {hasUpdate && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModalOpen(true)}
            className="h-8 gap-1.5 border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium animate-pulse"
          >
            <Sparkles className="size-3.5" />
            <span className="hidden sm:inline">Bản mới</span> {updateInfo?.version}
          </Button>
        )}
        <div className="relative hidden w-56 xl:block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 bg-card pl-9" placeholder="Search tasks..." aria-label="Search tasks" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isDark ? "Use light theme" : "Use dark theme"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="size-[18px]" />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary" />
        </Button>
      </div>
    </header>
  );
}

