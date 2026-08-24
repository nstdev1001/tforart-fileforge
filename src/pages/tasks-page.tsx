import { ClipboardList, Plus } from "lucide-react";
import { useState } from "react";

import { TaskCard } from "@/components/tasks/task-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { TASK_STATUSES, taskStatusLabel, type TaskStatus } from "@/types/task";

type Filter = "all" | TaskStatus;

export function TasksPage() {
  const tasks = useAppStore((state) => state.tasks);
  const [filter, setFilter] = useState<Filter>("all");
  const filteredTasks = filter === "all" ? tasks : tasks.filter((task) => task.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
          {(["all", ...TASK_STATUSES] as Filter[]).map((status) => (
            <button key={status} onClick={() => setFilter(status)} className={cn("rounded-lg px-3 py-1.5 text-xs font-medium capitalize text-muted-foreground transition-colors", filter === status && "bg-primary text-primary-foreground")}>
              {status === "all" ? "All" : taskStatusLabel[status]}
            </button>
          ))}
        </div>
        <Button><Plus className="size-4" /> New task</Button>
      </div>

      {filteredTasks.length ? (
        <div className="grid gap-3 xl:grid-cols-2">{filteredTasks.map((task) => <TaskCard key={task.id} task={task} />)}</div>
      ) : (
        <div className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-border bg-card/50 text-center">
          <div>
            <ClipboardList className="mx-auto size-9 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-semibold">No {filter === "all" ? "" : taskStatusLabel[filter].toLowerCase()} tasks</p>
            <p className="mt-1 text-xs text-muted-foreground">New task workflows arrive in Phases 3 and 4.</p>
          </div>
        </div>
      )}
    </div>
  );
}

