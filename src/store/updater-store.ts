import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

import type { UpdateInfo, UpdateStatus } from "@/types/updater";

let activeUpdate: Update | null = null;

function isTauriEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  );
}

interface UpdaterState {
  status: UpdateStatus;
  currentAppVersion: string;
  updateInfo: UpdateInfo | null;
  downloadProgress: number;
  downloadedBytes: number;
  totalBytes: number;
  errorMessage: string | null;
  modalOpen: boolean;
  bannerDismissed: boolean;
  lastCheckedAt: Date | null;

  initCurrentVersion: () => Promise<void>;
  setModalOpen: (open: boolean) => void;
  setBannerDismissed: (dismissed: boolean) => void;
  checkForUpdates: (manual?: boolean) => Promise<void>;
  downloadAndInstallUpdate: () => Promise<void>;
  restartApp: () => Promise<void>;
  resetError: () => void;
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  status: "idle",
  currentAppVersion: "0.2.1",
  updateInfo: null,
  downloadProgress: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  errorMessage: null,
  modalOpen: false,
  bannerDismissed: false,
  lastCheckedAt: null,

  initCurrentVersion: async () => {
    if (!isTauriEnvironment()) return;
    try {
      const version = await getVersion();
      if (version) {
        set({ currentAppVersion: version });
      }
    } catch {
      // Fallback to default version if getVersion fails.
    }
  },

  setModalOpen: (open) => set({ modalOpen: open }),
  setBannerDismissed: (dismissed) => set({ bannerDismissed: dismissed }),

  resetError: () => set({ errorMessage: null, status: get().updateInfo ? "available" : "idle" }),

  checkForUpdates: async (manual = false) => {
    const { status } = get();
    if (status === "checking" || status === "downloading") return;

    set({ status: "checking", errorMessage: null });

    if (!isTauriEnvironment()) {
      // In browser preview / test environment without Tauri backend
      set({
        status: "up-to-date",
        lastCheckedAt: new Date(),
      });
      return;
    }

    try {
      const update = await check();
      const currentVer = get().currentAppVersion;

      if (update && update.available) {
        activeUpdate = update;
        const info: UpdateInfo = {
          version: update.version,
          currentVersion: update.currentVersion || currentVer,
          date: update.date,
          body: update.body || "Các cải tiến hiệu năng và bản vá lỗi mới nhất.",
        };

        set({
          status: "available",
          updateInfo: info,
          modalOpen: manual ? true : get().modalOpen,
          bannerDismissed: false,
          lastCheckedAt: new Date(),
        });
      } else {
        if (activeUpdate) {
          await activeUpdate.close().catch(() => {});
          activeUpdate = null;
        }
        set({
          status: "up-to-date",
          updateInfo: null,
          lastCheckedAt: new Date(),
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Không thể kiểm tra bản cập nhật. Vui lòng kiểm tra kết nối mạng.";

      set({
        status: "error",
        errorMessage: message,
        lastCheckedAt: new Date(),
      });
    }
  },

  downloadAndInstallUpdate: async () => {
    const { updateInfo } = get();
    if (!activeUpdate && !updateInfo) return;

    set({
      status: "downloading",
      downloadProgress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      errorMessage: null,
    });

    if (!isTauriEnvironment() || !activeUpdate) {
      // Simulated download in preview
      for (let i = 10; i <= 100; i += 15) {
        await new Promise((r) => setTimeout(r, 200));
        set({
          downloadProgress: Math.min(100, i),
          downloadedBytes: Math.floor((i / 100) * 35000000),
          totalBytes: 35000000,
        });
      }
      set({ status: "downloaded", downloadProgress: 100 });
      return;
    }

    try {
      let totalLength = 0;
      let downloaded = 0;

      await activeUpdate.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          totalLength = event.data.contentLength ?? 0;
          set({ totalBytes: totalLength, downloadedBytes: 0, downloadProgress: 0 });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const percent = totalLength > 0 ? Math.min(100, Math.round((downloaded / totalLength) * 100)) : 50;
          set({
            downloadedBytes: downloaded,
            downloadProgress: percent,
          });
        } else if (event.event === "Finished") {
          set({
            status: "downloaded",
            downloadProgress: 100,
            downloadedBytes: totalLength || downloaded,
          });
        }
      });

      set({ status: "downloaded", downloadProgress: 100 });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Lỗi trong quá trình tải hoặc cài đặt bản cập nhật.";

      set({
        status: "error",
        errorMessage: message,
      });
    }
  },

  restartApp: async () => {
    if (!isTauriEnvironment()) {
      window.location.reload();
      return;
    }

    try {
      await relaunch();
    } catch {
      // In some Windows installer cases, the updater installer takes over and closes the app.
    }
  },
}));
