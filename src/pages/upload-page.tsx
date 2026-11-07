import { useState } from "react";

import { NewCompressUploadForm } from "@/components/tasks/new-compress-upload-form";
import { TaskCard } from "@/components/tasks/task-card";
import { useAppStore } from "@/store/app-store";

export function UploadPage() {
  const tasks = useAppStore((state) => state.tasks);
  const [formKey, setFormKey] = useState(0);
  const uploads = tasks.filter((task) => task.kind === "compress-upload");

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div className="shrink-0">
        <NewCompressUploadForm key={formKey} onClose={() => setFormKey((key) => key + 1)} />
      </div>

      <section aria-label="Upload tasks" className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between border-b border-border pb-2">
          <h2 className="text-sm font-semibold">Upload tasks</h2>
          <span className="text-xs text-muted-foreground">{uploads.length}</span>
        </div>
        {uploads.length ? (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-3 xl:grid-cols-2">
              {uploads.map((task) => <TaskCard key={task.id} task={task} />)}
            </div>
          </div>
        ) : (
          <p className="border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
            No compress & upload tasks yet. Tasks you start above will appear here.
          </p>
        )}
      </section>
    </div>
  );
}
