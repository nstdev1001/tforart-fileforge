import { AlertCircle, CheckCircle2, Clock3, FileClock, History, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listTaskLogs } from "@/lib/tauri";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { taskStageLabel, taskStatusLabel, type TaskLog } from "@/types/task";

const levelTone: Record<TaskLog["level"], string> = {
  trace: "bg-muted-foreground",
  debug: "bg-slate-400",
  info: "bg-sky-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
};

export function HistoryPage() {
  const tasks = useAppStore((state) => state.tasks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [selectedId, tasks],
  );

  useEffect(() => {
    if (!selectedId && tasks.length) setSelectedId(tasks[0].id);
  }, [selectedId, tasks]);

  useEffect(() => {
    if (!selectedId) return;
    let disposed = false;
    setLoading(true);
    listTaskLogs(selectedId)
      .then((records) => {
        if (!disposed) setLogs(records);
      })
      .catch(() => {
        if (!disposed) setLogs([]);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [selectedId, selectedTask?.stage, selectedTask?.status]);

  if (!tasks.length) {
    return (
      <Card className="grid min-h-[520px] place-items-center border-dashed bg-card/60 text-center">
        <div className="max-w-sm px-6">
          <History className="mx-auto size-10 text-muted-foreground/60" />
          <h2 className="mt-4 font-semibold">History is clear</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Task records and worker logs will appear here.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid min-h-[560px] gap-5 lg:grid-cols-[320px_1fr]">
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/70">
          <CardTitle className="flex items-center gap-2"><FileClock className="size-4 text-primary" /> Task history</CardTitle>
          <CardDescription>{tasks.length} persisted task{tasks.length === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <div className="max-h-[650px] overflow-y-auto p-2">
          {tasks.map((task) => (
            <button
              type="button"
              key={task.id}
              onClick={() => setSelectedId(task.id)}
              className={cn(
                "w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent",
                selectedId === task.id && "bg-primary/[0.08]",
              )}
            >
              <span className="block truncate text-xs font-semibold">{task.name}</span>
              <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>{taskStatusLabel[task.status]} · {taskStageLabel[task.stage]}</span>
                <span className="shrink-0">{formatRelativeTime(task.updatedAt)}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-start justify-between gap-3 border-b border-border/70">
          <div className="min-w-0">
            <CardTitle className="truncate">{selectedTask?.name ?? "Task log"}</CardTitle>
            <CardDescription className="mt-1 truncate">{selectedTask?.sourcePath}</CardDescription>
          </div>
          {selectedTask ? <Badge variant={selectedTask.status === "completed" ? "success" : selectedTask.status === "failed" ? "danger" : "info"}>{taskStatusLabel[selectedTask.status]}</Badge> : null}
        </CardHeader>
        <CardContent className="p-5">
          {loading ? (
            <div className="grid min-h-52 place-items-center text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /></div>
          ) : logs.length ? (
            <ol className="relative ml-2 border-l border-border/80">
              {logs.map((log) => (
                <li key={log.id} className="relative pb-5 pl-6 last:pb-0">
                  <span className={cn("absolute -left-1 top-1 size-2 rounded-full ring-4 ring-card", levelTone[log.level])} />
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-[11px] font-semibold text-primary">{log.event}</code>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{log.level}</span>
                    <time className="ml-auto text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</time>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/85">{log.message}</p>
                </li>
              ))}
            </ol>
          ) : (
            <div className="grid min-h-52 place-items-center text-center text-muted-foreground">
              <div>{selectedTask?.status === "failed" ? <AlertCircle className="mx-auto size-7" /> : selectedTask?.status === "completed" ? <CheckCircle2 className="mx-auto size-7" /> : <Clock3 className="mx-auto size-7" />}<p className="mt-2 text-xs">No detailed log entries for this task.</p></div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
