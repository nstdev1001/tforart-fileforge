import { Plus, Telescope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function WatchersPage() {
  return (
    <Card className="grid min-h-[520px] place-items-center border-dashed bg-card/60 text-center">
      <div className="max-w-sm px-6">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Telescope className="size-6" /></div>
        <h2 className="mt-4 font-semibold">Watch a folder automatically</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Watchers detect stable new files and add them to the upload queue. Native watching is scheduled for Phase 6.</p>
        <Button className="mt-5" disabled><Plus className="size-4" /> Add watcher</Button>
      </div>
    </Card>
  );
}

