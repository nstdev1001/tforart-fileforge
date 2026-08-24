import { Layers3 } from "lucide-react";

import { cn } from "@/lib/utils";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Layers3 className="size-5" strokeWidth={2.2} />
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="text-[15px] font-bold tracking-tight">FileForge</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Automation desk
          </div>
        </div>
      )}
    </div>
  );
}

