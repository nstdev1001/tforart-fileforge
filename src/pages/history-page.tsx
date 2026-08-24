import { History } from "lucide-react";

import { Card } from "@/components/ui/card";

export function HistoryPage() {
  return (
    <Card className="grid min-h-[520px] place-items-center border-dashed bg-card/60 text-center">
      <div className="max-w-sm px-6">
        <History className="mx-auto size-10 text-muted-foreground/60" />
        <h2 className="mt-4 font-semibold">History is clear</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Completed task records and detailed logs will appear here.</p>
      </div>
    </Card>
  );
}

