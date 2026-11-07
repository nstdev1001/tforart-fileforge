import { ArrowRight, Download, Telescope, UploadCloud } from "lucide-react";

import { TaskCard } from "@/components/tasks/task-card";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";

const actions = [
  { id: "upload", label: "Compress & upload", icon: UploadCloud },
  { id: "download", label: "Download & extract", icon: Download },
  { id: "watchers", label: "Track folder", icon: Telescope },
] as const;

export function DashboardPage() {
  const tasks = useAppStore((state) => state.tasks);
  const setActiveView = useAppStore((state) => state.setActiveView);

  return (
    <div className="space-y-8">
      <section aria-label="Quick start" className="grid gap-px border border-border bg-border md:grid-cols-3">
        {actions.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            className="group flex h-40 flex-col justify-between bg-card p-5 text-left transition-colors hover:bg-primary hover:text-primary-foreground"
          >
            <Icon className="size-7 text-primary group-hover:text-primary-foreground" strokeWidth={1.6} />
            <span className="flex items-center justify-between text-sm font-semibold">
              {label}
              <ArrowRight className="size-4 opacity-60 transition-transform group-hover:translate-x-1 group-hover:opacity-100" />
            </span>
          </button>
        ))}
      </section>

      {tasks.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent tasks</h2>
            <Button variant="ghost" size="sm" onClick={() => setActiveView("tasks")}>
              View all <ArrowRight className="size-3.5" />
            </Button>
          </div>
          <div className="grid min-w-0 gap-3 xl:grid-cols-2">
            {tasks.slice(0, 4).map((task) => <TaskCard key={task.id} task={task} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
