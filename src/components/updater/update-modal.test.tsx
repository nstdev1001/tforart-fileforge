import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UpdateModal } from "@/components/updater/update-modal";
import { useUpdaterStore } from "@/store/updater-store";

describe("UpdateModal", () => {
  beforeEach(() => {
    useUpdaterStore.setState({
      status: "idle",
      currentAppVersion: "0.1.0",
      updateInfo: null,
      downloadProgress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      errorMessage: null,
      modalOpen: false,
    });
  });

  it("does not render when modalOpen is false", () => {
    useUpdaterStore.setState({
      modalOpen: false,
      updateInfo: {
        version: "0.2.0",
        currentVersion: "0.1.0",
        body: "Tính năng mới",
      },
    });

    render(<UpdateModal />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders version info and release notes when open", () => {
    useUpdaterStore.setState({
      modalOpen: true,
      status: "available",
      currentAppVersion: "0.1.0",
      updateInfo: {
        version: "0.2.0",
        currentVersion: "0.1.0",
        body: "Sửa lỗi crash khi nén file lớn",
      },
    });

    render(<UpdateModal />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Cập nhật Tforart FileForge")).toBeInTheDocument();
    expect(screen.getByText("v0.2.0")).toBeInTheDocument();
    expect(screen.getByText("Sửa lỗi crash khi nén file lớn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cập nhật ngay" })).toBeInTheDocument();
  });

  it("renders download progress when status is downloading", () => {
    useUpdaterStore.setState({
      modalOpen: true,
      status: "downloading",
      downloadProgress: 45,
      downloadedBytes: 4500000,
      totalBytes: 10000000,
      updateInfo: {
        version: "0.2.0",
        currentVersion: "0.1.0",
      },
    });

    render(<UpdateModal />);
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("Đang tải gói cài đặt...")).toBeInTheDocument();
  });

  it("calls downloadAndInstallUpdate when user clicks update button", async () => {
    const downloadAndInstallMock = vi.fn().mockResolvedValue(undefined);
    useUpdaterStore.setState({
      modalOpen: true,
      status: "available",
      updateInfo: {
        version: "0.2.0",
        currentVersion: "0.1.0",
      },
      downloadAndInstallUpdate: downloadAndInstallMock,
    });

    const user = userEvent.setup();
    render(<UpdateModal />);

    await user.click(screen.getByRole("button", { name: "Cập nhật ngay" }));
    expect(downloadAndInstallMock).toHaveBeenCalledTimes(1);
  });
});
