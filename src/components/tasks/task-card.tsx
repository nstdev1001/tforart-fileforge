import {
  Archive,
  Check,
  CircleAlert,
  Clock3,
  Download,
  Ellipsis,
  Eye,
  Pause,
  Play,
  RotateCcw,
  UploadCloud,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn, formatBytes, formatRelativeTime } from "@/lib/utils";
import { taskStatusLabel, type Task, type TaskStatus } from "@/types/task";

const statusAppearance: Record<
  TaskStatus,
  { badge: "neutral" | "info" | "warning" | "danger" | "success"; icon: typeof Clock3; color: string }
> = {
  queued: { badge: "neutral", icon: Clock3, color: "bg-muted-foreground" },
  running: { badge: "info", icon: Play, color: "bg-sky-500" },
  paused: { badge: "warning", icon: Pause, color: "bg-amber-500" },
  failed: { badge: "danger", icon: CircleAlert, color: "bg-red-500" },
  completed: { badge: "success", icon: Check, color: "bg-emerald-500" },
};

const kindIcon = {
  "compress-upload": UploadCloud,
  "download-extract": Download,
  "watch-upload": Eye,
};

export function TaskCard({ task }: { task: Task }) {
  const appearance = statusAppearance[task.status];
  const StatusIcon = appearance.icon;
  const KindIcon = kindIcon[task.kind] ?? Archive;
  const displayProgress = task.status === "completed" ? 100 : task.progress;

  return (
    <Card className="p-4 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
      <div className="flex items-start gap-3.5">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <KindIcon className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{task.name}</h3>
              <p className="mt-1 truncate text-[11px] text-muted-foreground" title={task.sourcePath}>
                {task.sourcePath}
              </p>
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
              <span>
                {formatBytes(task.bytesProcessed)} / {formatBytes(task.bytesTotal)}
              </span>
              <span className="font-semibold text-foreground">{Math.round(displayProgress)}%</span>
            </div>
            <Progress
              value={displayProgress}
              indicatorClassName={cn(appearance.color, task.status === "running" && "animate-pulse")}
            />
          </div>

          <div className="mt-3 flex min-h-5 items-center justify-between text-[11px] text-muted-foreground">
            <div className="flex items-center gap-3">
              {task.speedBytesPerSecond ? <span>{formatBytes(task.speedBytesPerSecond)}/s</span> : null}
              {task.etaSeconds ? <span>ETA {Math.ceil(task.etaSeconds / 60)}m</span> : null}
              {task.retryCount > 0 ? (
                <span className="flex items-center gap-1"><RotateCcw className="size-3" /> Retry {task.retryCount}</span>
              ) : null}
              {task.errorMessage ? <span className="truncate text-red-600 dark:text-red-300">{task.errorMessage}</span> : null}
            </div>
            <span>{formatRelativeTime(task.updatedAt)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

