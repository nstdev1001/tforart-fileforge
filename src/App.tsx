import { AppShell } from "@/components/layout/app-shell";
import { UpdateBanner } from "@/components/updater/update-banner";
import { UpdateModal } from "@/components/updater/update-modal";
import { useAutoUpdater } from "@/hooks/use-auto-updater";
import { useTaskEvents } from "@/hooks/use-task-events";
import { useTheme } from "@/hooks/use-theme";
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
  useAutoUpdater();
  const activeView = useAppStore((state) => state.activeView);
  const ActivePage = views[activeView];

  return (
    <>
      <AppShell><ActivePage /></AppShell>
      <UpdateBanner />
      <UpdateModal />
    </>
  );
}
