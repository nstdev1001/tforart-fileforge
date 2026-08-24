import {
  Activity,
  ChevronLeft,
  ClipboardList,
  History,
  LayoutDashboard,
  Settings,
  Telescope,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type AppView, useAppStore } from "@/store/app-store";

const navigation: Array<{
  id: AppView;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "watchers", label: "Watchers", icon: Telescope },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const activeView = useAppStore((state) => state.activeView);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const collapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);

  return (
    <aside
      className={cn(
        "relative flex h-full shrink-0 flex-col border-r border-border/80 bg-card/80 px-3 py-4 backdrop-blur-xl transition-[width] duration-200",
        collapsed ? "w-[76px]" : "w-[228px]",
      )}
    >
      <div className={cn("mb-7 px-2", collapsed && "px-1")}>
        <BrandMark compact={collapsed} />
      </div>

      <nav aria-label="Primary navigation" className="flex flex-1 flex-col gap-1">
        {navigation.map(({ id, label, icon: Icon }) => {
          const active = id === activeView;
          return (
            <button
              key={id}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              onClick={() => setActiveView(id)}
              className={cn(
                "group flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                active && "bg-primary/10 text-primary",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.3 : 1.8} />
              {!collapsed && <span>{label}</span>}
              {active && !collapsed && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="mb-3 rounded-2xl border border-primary/10 bg-primary/[0.06] p-3.5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary">
            <Activity className="size-3.5" /> System ready
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Local task engine and database are available.
          </p>
        </div>
      )}

      <Button
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        variant="ghost"
        size={collapsed ? "icon" : "sm"}
        className={cn(!collapsed && "justify-start text-muted-foreground")}
        onClick={toggleSidebar}
      >
        <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
        {!collapsed && "Collapse"}
      </Button>
    </aside>
  );
}

