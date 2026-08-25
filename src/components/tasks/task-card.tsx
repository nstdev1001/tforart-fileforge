import {
  Archive,
  Check,
  Copy,
  CircleAlert,
  Clock3,
  Download,
  Ellipsis,
  Eye,
  Pause,
  Play,
  RotateCcw,
  Square,
  UploadCloud,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { isWatcherAggregateTask } from "@/lib/task-utils";
import { cn, formatBytes, formatRelativeTime } from "@/lib/utils";
import { pauseTask, resumeTask } from "@/lib/tauri";
import { useAppStore } from "@/store/app-store";
import { taskStageLabel, taskStatusLabel, type Task, type TaskStatus } from "@/types/task";

const statusAppearance: Record<
  TaskStatus,
  { badge: "neutral" | "info" | "warning" | "danger" | "success"; icon: typeof Clock3; color: string }
> = {
  queued: { badge: "neutral", icon: Clock3, color: "bg-muted-foreground" },
  running: { badge: "info", icon: Play, color: "bg-sky-500" },
  paused: { badge: "warning", icon: Pause, color: "bg-amber-500" },
  stopped: { badge: "neutral", icon: Square, color: "bg-muted-foreground" },
  failed: { badge: "danger", icon: CircleAlert, color: "bg-red-500" },
  completed: { badge: "success", icon: Check, color: "bg-emerald-500" },
};

const kindIcon = {
  "compress-upload": UploadCloud,
  "download-extract": Download,
  "watch-upload": Eye,
  watcher: Eye,
};

function folderNameFromPath(path: string): string {
  const pathWithoutTrailingSeparators = path.replace(/[\\/]+$/, "");
  return pathWithoutTrailingSeparators.split(/[\\/]/).pop() || path;
}

export function TaskCard({ task }: { task: Task }) {
  const [controlBusy, setControlBusy] = useState(false);
  const upsertTask = useAppStore((state) => state.upsertTask);
  const appearance = statusAppearance[task.status];
  const StatusIcon = appearance.icon;
  const KindIcon = kindIcon[task.kind] ?? Archive;
  const isWatcherAggregate = isWatcherAggregateTask(task);
  const canTogglePause =
    !isWatcherAggregate && (task.status === "running" || task.status === "paused");
  const displayProgress = task.status === "completed" ? 100 : task.progress;
  const trackedFolderName = isWatcherAggregate ? folderNameFromPath(task.sourcePath) : undefined;
  const driveFolderName = task.driveFolderName ?? "Unknown folder";

  async function togglePause() {
    setControlBusy(true);
    try {
      upsertTask(task.status === "paused" ? await resumeTask(task.id) : await pauseTask(task.id));
    } finally {
      setControlBusy(false);
    }
  }

  async function copyShareLink() {
    if (task.driveWebViewLink) await navigator.clipboard.writeText(task.driveWebViewLink);
  }

  return (
    <Card className="w-full min-w-0 max-w-full overflow-hidden p-4 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
      <div className="flex min-w-0 items-start gap-3.5">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <KindIcon className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold">{task.name}</h3>
              {isWatcherAggregate ? (
                <div className="mt-1 grid min-w-0 gap-0.5 text-[11px] text-muted-foreground">
                  <p className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0">Tracking folder:</span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground/80" title={task.sourcePath}>
                      {trackedFolderName}
                    </span>
                  </p>
                  <p className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0">Google Drive:</span>
                    <span
                      className="min-w-0 flex-1 truncate font-medium text-foreground/80"
                      title={task.driveFolderName}
                    >
                      {driveFolderName}
                    </span>
                    <span className="shrink-0">· {taskStageLabel[task.stage]}</span>
                  </p>
                </div>
              ) : (
                <p className="mt-1 truncate text-[11px] text-muted-foreground" title={task.sourcePath}>
                  {task.sourcePath} · {taskStageLabel[task.stage]}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge variant={appearance.badge}>
                <StatusIcon className="mr-1 size-3" />
                {taskStatusLabel[task.status]}
              </Badge>
              <Button variant="ghost" size="icon" className="size-7" aria-label={`More options for ${task.name}`}>
                <Ellipsis className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex justify-between text-[11px] text-muted-foreground">
              {isWatcherAggregate ? (
                <span className="flex items-center gap-3">
                  <span>{task.filesDetected ?? 0} Detected</span>
                  <span>{task.filesUploaded ?? 0} Uploaded</span>
                </span>
              ) : (
                <span>
                  {formatBytes(task.bytesProcessed)} / {formatBytes(task.bytesTotal)}
                </span>
              )}
              <span className="font-semibold text-foreground">{Math.round(displayProgress)}%</span>
            </div>
            <Progress
              value={displayProgress}
              label={isWatcherAggregate ? "Watcher progress" : "Task progress"}
              indicatorClassName={cn(appearance.color, task.status === "running" && "animate-pulse")}
            />
          </div>

          <div className="mt-3 flex min-h-5 items-center justify-between text-[11px] text-muted-foreground">
            <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
              {task.speedBytesPerSecond ? <span>{formatBytes(task.speedBytesPerSecond)}/s</span> : null}
              {task.etaSeconds ? <span>ETA {Math.ceil(task.etaSeconds / 60)}m</span> : null}
              {task.retryCount > 0 ? (
                <span className="flex items-center gap-1"><RotateCcw className="size-3" /> Retry {task.retryCount}</span>
              ) : null}
              {task.errorMessage ? <span className="truncate text-red-600 dark:text-red-300">{task.errorMessage}</span> : null}
            </div>
            <span className="ml-3 shrink-0">{formatRelativeTime(task.updatedAt)}</span>
          </div>
          {(canTogglePause || task.driveWebViewLink) ? (
            <div className="mt-3 flex justify-end gap-2 border-t border-border/60 pt-3">
              {task.driveWebViewLink ? (
                <Button variant="outline" size="sm" className="h-7" onClick={copyShareLink}>
                  <Copy className="size-3" /> {isWatcherAggregate ? "Copy folder link" : "Copy link"}
                </Button>
              ) : null}
              {canTogglePause ? (
                <Button variant="outline" size="sm" className="h-7" disabled={controlBusy} onClick={togglePause}>
                  {task.status === "paused" ? <Play className="size-3" /> : <Pause className="size-3" />}
                  {task.status === "paused" ? "Resume" : "Pause"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
