import { AppShell } from "@/components/layout/app-shell";
import { useTheme } from "@/hooks/use-theme";
import { useTaskEvents } from "@/hooks/use-task-events";
import { DashboardPage } from "@/pages/dashboard-page";
import { HistoryPage } from "@/pages/history-page";
import { SettingsPage } from "@/pages/settings-page";
import { TasksPage } from "@/pages/tasks-page";
import { WatchersPage } from "@/pages/watchers-page";
import { useAppStore } from "@/store/app-store";

const views = {
  dashboard: DashboardPage,
  tasks: TasksPage,
  watchers: WatchersPage,
  history: HistoryPage,
  settings: SettingsPage,
};

export default function App() {
  useTheme();
  useTaskEvents();
  const activeView = useAppStore((state) => state.activeView);
  const ActivePage = views[activeView];

  return <AppShell><ActivePage /></AppShell>;
}
