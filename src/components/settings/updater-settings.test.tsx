import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UpdaterSettings } from "@/components/settings/updater-settings";
import { useUpdaterStore } from "@/store/updater-store";

describe("UpdaterSettings", () => {
  beforeEach(() => {
    useUpdaterStore.setState({
      status: "idle",
      currentAppVersion: "0.2.0",
      updateInfo: null,
      errorMessage: null,
      lastCheckedAt: null,
    });
  });

  it("renders current app version and check button", () => {
    render(<UpdaterSettings />);

    expect(screen.getByText("Cập nhật ứng dụng")).toBeInTheDocument();
    expect(screen.getByText("v0.2.0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kiểm tra cập nhật" })).toBeInTheDocument();
  });

  it("triggers checkForUpdates when check button is clicked", async () => {
    const checkMock = vi.fn().mockResolvedValue(undefined);
    useUpdaterStore.setState({
      checkForUpdates: checkMock,
    });

    const user = userEvent.setup();
    render(<UpdaterSettings />);

    await user.click(screen.getByRole("button", { name: "Kiểm tra cập nhật" }));
    expect(checkMock).toHaveBeenCalledWith(true);
  });

  it("shows update available badge and view button when update is ready", () => {
    useUpdaterStore.setState({
      status: "available",
      updateInfo: {
        version: "0.2.0",
        currentVersion: "0.1.0",
      },
    });

    render(<UpdaterSettings />);
    expect(screen.getByText("Có bản mới: 0.2.0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xem bản cập nhật" })).toBeInTheDocument();
  });
});
