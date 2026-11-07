import { useState } from "react";

import { NewDownloadExtractForm } from "@/components/tasks/new-download-extract-form";
import { TaskCard } from "@/components/tasks/task-card";
import { useAppStore } from "@/store/app-store";

export function DownloadPage() {
  const tasks = useAppStore((state) => state.tasks);
  const [formKey, setFormKey] = useState(0);
  const items = tasks.filter((task) => task.kind === "download-extract");

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="shrink-0">
        <NewDownloadExtractForm key={formKey} onClose={() => setFormKey((key) => key + 1)} />
      </div>

      <section aria-label="Download tasks" className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between border-b border-border pb-2">
          <h2 className="text-sm font-semibold">Download tasks</h2>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </div>
        {items.length ? (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-3 xl:grid-cols-2">
              {items.map((task) => <TaskCard key={task.id} task={task} />)}
            </div>
          </div>
        ) : (
          <p className="border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            No download & extract tasks yet. Tasks you start above will appear here.
          </p>
        )}
      </section>
    </div>
  );
}
