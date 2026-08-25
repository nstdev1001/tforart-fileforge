import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleGauge,
  Clock3,
  Database,
  FolderInput,
  HardDrive,
  Plus,
  Telescope,
  UploadCloud,
} from "lucide-react";

import { TaskCard } from "@/components/tasks/task-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDatabaseHealth, getDiskFreeSpace, pickFolder } from "@/lib/tauri";
import { formatBytes } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { DatabaseHealth, DiskSpace } from "@/types/system";

const statCards = [
  { label: "Active tasks", value: "active", icon: CircleGauge, tone: "text-sky-600 bg-sky-500/10" },
  { label: "In queue", value: "queued", icon: Clock3, tone: "text-amber-600 bg-amber-500/10" },
  { label: "Completed", value: "completed", icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-500/10" },
] as const;

export function DashboardPage() {
  const tasks = useAppStore((state) => state.tasks);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [disk, setDisk] = useState<DiskSpace | null>(null);
  const [database, setDatabase] = useState<DatabaseHealth | null>(null);
  const [nativeMessage, setNativeMessage] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      active: tasks.filter((task) => task.status === "running" || task.status === "paused").length,
      queued: tasks.filter((task) => task.status === "queued").length,
      completed: tasks.filter((task) => task.status === "completed").length,
    }),
    [tasks],
  );

  useEffect(() => {
    getDatabaseHealth().then(setDatabase).catch(() => {
      // Vite's browser preview has no Rust runtime; the desktop build supplies it.
    });
  }, []);

  async function chooseSourceFolder() {
    setNativeMessage(null);
    try {
      const folder = await pickFolder();
      if (!folder) return;
      setSelectedFolder(folder);
      setDisk(await getDiskFreeSpace(folder));
    } catch {
      setNativeMessage("Folder selection is available in the Tauri desktop runtime.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        {statCards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{counts[value]}</p>
              </div>
              <div className={`grid size-11 place-items-center rounded-2xl ${tone}`}>
                <Icon className="size-5" />
              </div>
            </div>
          </Card>
        ))}
      </section>

      <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border/70">
            <div>
              <CardTitle>Recent tasks</CardTitle>
              <CardDescription>Transfers and automations across this device.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setActiveView("tasks")}>
              View all <ArrowRight className="size-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="min-w-0 p-4">
            {tasks.length ? (
              <div className="grid min-w-0 gap-3">{tasks.slice(0, 3).map((task) => <TaskCard key={task.id} task={task} />)}</div>
            ) : (
              <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-border bg-muted/30 px-6 text-center">
                <div>
                  <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <UploadCloud className="size-5" />
                  </div>
                  <p className="mt-3 text-sm font-semibold">No tasks yet</p>
                  <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                    Pick a source folder to validate native filesystem access and available space.
                  </p>
                  <Button className="mt-4" size="sm" onClick={chooseSourceFolder}>
                    <Plus className="size-3.5" /> Choose folder
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick actions</CardTitle>
              <CardDescription>Start with a local folder.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <button onClick={chooseSourceFolder} className="flex w-full items-center gap-3 rounded-xl border border-border/70 p-3 text-left transition-colors hover:bg-accent">
                <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><FolderInput className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold">Choose source folder</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{selectedFolder ?? "Test the native folder picker"}</span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </button>
              <button onClick={() => setActiveView("watchers")} className="flex w-full items-center gap-3 rounded-xl border border-border/70 p-3 text-left transition-colors hover:bg-accent">
                <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><Telescope className="size-4" /></span>
                <span className="flex-1"><span className="block text-xs font-semibold">Create watcher</span><span className="block text-[11px] text-muted-foreground">Prepare folder automation</span></span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Local foundation</CardTitle>
                <Badge variant={database ? "success" : "neutral"}>{database ? "Connected" : "Desktop only"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground"><Database className="size-3.5" /><span>SQLite schema</span><span className="ml-auto text-foreground">{database ? `v${database.schemaVersion}` : "—"}</span></div>
              <div className="flex items-center gap-2 text-muted-foreground"><HardDrive className="size-3.5" /><span>Free disk space</span><span className="ml-auto text-foreground">{disk ? formatBytes(disk.freeBytes) : "—"}</span></div>
              {nativeMessage ? <p className="rounded-lg bg-muted p-2 text-[11px] leading-relaxed text-muted-foreground">{nativeMessage}</p> : null}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
