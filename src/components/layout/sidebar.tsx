import {
  ChevronLeft,
  ClipboardList,
  Download,
  History,
  LayoutDashboard,
  Settings,
  Telescope,
  UploadCloud,
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
  { id: "upload", label: "Compress & upload", icon: UploadCloud },
  { id: "download", label: "Download & extract", icon: Download },
  { id: "watchers", label: "Track folder", icon: Telescope },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
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
        "relative flex h-full shrink-0 flex-col border-r border-border bg-card/90 px-3 py-4 backdrop-blur transition-[width] duration-200",
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
                "group flex h-10 items-center gap-3 border-l-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                active && "border-primary bg-primary/10 text-primary",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.3 : 1.8} />
              {!collapsed && <span>{label}</span>}
            </button>
          );
        })}
      </nav>

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
