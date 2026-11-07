import { Moon, Sparkles, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type AppView, useAppStore } from "@/store/app-store";
import { useUpdaterStore } from "@/store/updater-store";

const viewTitles: Record<AppView, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Quick start" },
  upload: { title: "Compress & upload", subtitle: "Archive a folder and send it to Google Drive." },
  download: { title: "Download & extract", subtitle: "Fetch an archive from Drive and extract it." },
  tasks: { title: "Tasks", subtitle: "Track every compression, transfer, and extraction." },
  watchers: { title: "Track folder", subtitle: "Automate uploads from folders you choose." },
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
    <header className="flex h-[72px] shrink-0 items-center justify-between gap-5 border-b border-border px-7" data-tauri-drag-region>
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
        <Button
          variant="ghost"
          size="icon"
          aria-label={isDark ? "Use light theme" : "Use dark theme"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </Button>
      </div>
    </header>
  );
}

