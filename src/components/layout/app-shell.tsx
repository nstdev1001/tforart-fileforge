import type { ReactNode } from "react";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

export function AppShell({ children }: { children: ReactNode }) {
  // Pages that manage their own scrolling (pinned form + scrolling list).
  const fixedHeight = useAppStore((state) => ["upload", "download", "watchers"].includes(state.activeView));
  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className={cn("min-h-0 flex-1", fixedHeight ? "overflow-hidden" : "overflow-y-auto")}>
          <div className={cn("mx-auto max-w-[1500px] p-7", fixedHeight && "h-full")}>{children}</div>
        </main>
      </div>
    </div>
  );
}

