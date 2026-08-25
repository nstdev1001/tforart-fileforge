import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createWatcher,
  deleteWatcher,
  listGoogleDriveFolder,
  listWatchers,
  pickFolder,
  restartWatcher,
  stopWatcher,
} from "@/lib/tauri";
import { WatchersPage } from "@/pages/watchers-page";
import { useAppStore } from "@/store/app-store";
import type { FolderWatcher } from "@/types/task";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@/lib/tauri", () => ({
  createWatcher: vi.fn(),
  deleteWatcher: vi.fn(),
  listGoogleDriveFolder: vi.fn(),
  listWatchers: vi.fn(),
  pickFolder: vi.fn(),
  restartWatcher: vi.fn(),
  stopWatcher: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

const stoppedWatcher: FolderWatcher = {
  id: "watcher-one",
  name: "Existing render watcher",
  localPath: "\\\\?\\C:\\Projects\\renders",
  driveFolderId: "drive-folder",
  enabled: false,
  status: "stopped",
  settlingDelayMs: 3_000,
  includeExtensions: ["jpg"],
  excludePatterns: [],
  autoStopSeconds: 30,
  filesDetected: 2,
  filesUploading: 0,
  filesUploaded: 2,
  filesFailed: 0,
  createdAt: "2026-08-25T08:00:00.000Z",
  updatedAt: "2026-08-25T08:01:00.000Z",
};

describe("WatchersPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAppStore.setState({ tasks: [], removedTaskIds: [] });
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(listen).mockResolvedValue(vi.fn());
    vi.mocked(listWatchers).mockResolvedValue([]);
    vi.mocked(listGoogleDriveFolder).mockResolvedValue({ files: [] });
    vi.mocked(pickFolder).mockResolvedValue(null);
    vi.mocked(deleteWatcher).mockResolvedValue(undefined);
    vi.mocked(stopWatcher).mockResolvedValue(undefined);
  });

  it("registers watcher progress before loading the hydration snapshot", async () => {
    const listenerReady = deferred<() => void>();
    vi.mocked(listen).mockReturnValue(listenerReady.promise);

    render(<WatchersPage />);

    expect(listen).toHaveBeenCalledWith("watcher-progress", expect.any(Function));
    expect(listWatchers).not.toHaveBeenCalled();

    await act(async () => {
      listenerReady.resolve(vi.fn());
      await listenerReady.promise;
    });

    await waitFor(() => expect(listWatchers).toHaveBeenCalledOnce());
  });

  it("surfaces watcher hydration failures", async () => {
    vi.mocked(listWatchers).mockRejectedValue(new Error("database busy"));

    render(<WatchersPage />);

    expect(await screen.findByText(
      "Could not load folder watchers: database busy",
    )).toBeInTheDocument();
  });

  it("keeps native hydration errors hidden in browser preview", async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    vi.mocked(listWatchers).mockRejectedValue(new Error("IPC unavailable"));

    render(<WatchersPage />);

    await waitFor(() => expect(listWatchers).toHaveBeenCalledOnce());
    expect(screen.queryByText(/Could not load folder watchers/)).not.toBeInTheDocument();
  });

  it("refreshes stopped watchers after a create failure", async () => {
    const createError = "Google Drive request failed";
    vi.mocked(listWatchers)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([stoppedWatcher]);
    vi.mocked(pickFolder).mockResolvedValue("C:\\Projects\\renders");
    vi.mocked(createWatcher).mockRejectedValue(createError);
    const user = userEvent.setup();

    render(<WatchersPage />);
    await waitFor(() => expect(listWatchers).toHaveBeenCalledOnce());

    await user.click(screen.getAllByRole("button", { name: "Add watcher" })[0]);
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Choose a folder to watch"))
        .toHaveValue("C:\\Projects\\renders");
    });
    await user.click(screen.getByRole("button", { name: "Start watching" }));

    expect(await screen.findByText(createError)).toBeInTheDocument();
    expect(await screen.findByText(stoppedWatcher.name)).toBeInTheDocument();
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start again" })).toBeInTheDocument();
    expect(listWatchers).toHaveBeenCalledTimes(2);
    expect(restartWatcher).not.toHaveBeenCalled();
  });
});
