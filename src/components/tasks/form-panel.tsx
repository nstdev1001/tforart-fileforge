import type { ReactNode } from "react";

export function PanelTitle({ step, icon, title, hint }: { step: string; icon: ReactNode; title: string; hint: string }) {
  return (
    <header className="flex items-start gap-3 border-b border-border pb-4">
      <span className="grid size-8 shrink-0 place-items-center bg-primary text-sm font-semibold text-primary-foreground">{step}</span>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">{icon} {title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
    </header>
  );
}

export function PanelFlow({ children }: { children: ReactNode }) {
  return <div className="grid items-stretch gap-px border border-border bg-border lg:grid-cols-[1fr_auto_1fr]">{children}</div>;
}

export function PanelArrow({ icon }: { icon: ReactNode }) {
  return (
    <div className="hidden place-items-center bg-background px-3 text-primary lg:grid" aria-hidden="true">
      {icon}
    </div>
  );
}
