import { useEffect } from "react";

import { useUpdaterStore } from "@/store/updater-store";

const AUTO_CHECK_DELAY_MS = 3500;
const PERIODIC_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

export function useAutoUpdater() {
  const initCurrentVersion = useUpdaterStore((state) => state.initCurrentVersion);
  const checkForUpdates = useUpdaterStore((state) => state.checkForUpdates);

  useEffect(() => {
    void initCurrentVersion();

    const initialTimer = setTimeout(() => {
      void checkForUpdates(false);
    }, AUTO_CHECK_DELAY_MS);

    const intervalTimer = setInterval(() => {
      void checkForUpdates(false);
    }, PERIODIC_CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [initCurrentVersion, checkForUpdates]);
}
