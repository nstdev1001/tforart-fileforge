import { Layers3 } from "lucide-react";

import fileForgeLogo from "@/assets/tforart-fileforge-logo.svg";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div
        aria-label="Tforart FileForge"
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"
        role="img"
      >
        <Layers3 aria-hidden="true" className="size-5" strokeWidth={2.2} />
      </div>
    );
  }

  return (
    <div className="flex h-9 items-center">
      <img
        alt="Tforart FileForge"
        className="block w-full max-w-46 dark:invert"
        src={fileForgeLogo}
      />
    </div>
  );
}
