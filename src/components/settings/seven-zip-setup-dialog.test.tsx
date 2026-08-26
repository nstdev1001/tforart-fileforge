import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SevenZipSetupDialog } from "@/components/settings/seven-zip-setup-dialog";
import {
  getSevenZipStatus,
  openSevenZipDownloadPage,
  setSevenZipPath,
} from "@/lib/tauri";

vi.mock("@/lib/tauri", () => ({
  getSevenZipStatus: vi.fn(),
  openSevenZipDownloadPage: vi.fn(),
  setSevenZipPath: vi.fn(),
}));

describe("SevenZipSetupDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(openSevenZipDownloadPage).mockResolvedValue();
  });

  it("offers the official download and a manual executable path", async () => {
    const user = userEvent.setup();
    render(
      <SevenZipSetupDialog
        open
        onClose={vi.fn()}
        onReady={vi.fn()}
      />,
    );

    expect(screen.getByRole("alertdialog", { name: "7-Zip is required" })).toBeInTheDocument();
    expect(screen.getByText("https://www.7-zip.org/download.html")).toBeInTheDocument();
    expect(screen.getByLabelText("Option 2 — Enter the path to 7z.exe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and verify" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Open official download" }));

    expect(openSevenZipDownloadPage).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent("official download page is open");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("keeps an invalid configured path inside the modal", async () => {
    vi.mocked(setSevenZipPath).mockRejectedValue(
      "configured 7-Zip path does not point to 7z.exe: C:\\Tools\\rar.exe",
    );
    const onClose = vi.fn();
    const onReady = vi.fn();
    const user = userEvent.setup();
    render(<SevenZipSetupDialog open onClose={onClose} onReady={onReady} />);

    await user.type(
      screen.getByLabelText("Option 2 — Enter the path to 7z.exe"),
      "C:\\Tools\\rar.exe",
    );
    await user.click(screen.getByRole("button", { name: "Save and verify" }));

    expect(setSevenZipPath).toHaveBeenCalledWith("C:\\Tools\\rar.exe");
    expect(await screen.findByRole("alert")).toHaveTextContent("does not point to 7z.exe");
    expect(onReady).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("returns the verified status and closes after saving a valid path", async () => {
    const readyStatus = {
      available: true,
      path: "C:\\Program Files\\7-Zip\\7z.exe",
      version: "7-Zip 26.02",
      source: "settings",
    };
    vi.mocked(setSevenZipPath).mockResolvedValue(readyStatus);
    const onClose = vi.fn();
    const onReady = vi.fn();
    const user = userEvent.setup();
    render(<SevenZipSetupDialog open onClose={onClose} onReady={onReady} />);

    await user.type(
      screen.getByLabelText("Option 2 — Enter the path to 7z.exe"),
      readyStatus.path,
    );
    await user.click(screen.getByRole("button", { name: "Save and verify" }));

    await waitFor(() => expect(onReady).toHaveBeenCalledWith(readyStatus));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("cannot be dismissed while an executable is being verified", async () => {
    const readyStatus = {
      available: true,
      path: "C:\\Tools\\7-Zip\\7z.exe",
      version: "7-Zip 26.02",
      source: "settings",
    };
    let resolveSave!: (status: typeof readyStatus) => void;
    vi.mocked(setSevenZipPath).mockImplementation(
      () => new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const onClose = vi.fn();
    const onReady = vi.fn();
    const user = userEvent.setup();
    render(<SevenZipSetupDialog open onClose={onClose} onReady={onReady} />);

    await user.type(
      screen.getByLabelText("Option 2 — Enter the path to 7z.exe"),
      readyStatus.path,
    );
    await user.click(screen.getByRole("button", { name: "Save and verify" }));

    await user.keyboard("{Escape}");
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog).toBeInTheDocument();

    await act(async () => resolveSave(readyStatus));
    expect(onReady).toHaveBeenCalledWith(readyStatus);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("can detect a standard installation without a manual path", async () => {
    const readyStatus = {
      available: true,
      path: "C:\\Program Files\\7-Zip\\7z.exe",
      version: "7-Zip 26.02",
      source: "auto-detected",
    };
    vi.mocked(getSevenZipStatus).mockResolvedValueOnce({ available: false });
    const onClose = vi.fn();
    const onReady = vi.fn();
    const user = userEvent.setup();
    render(<SevenZipSetupDialog open onClose={onClose} onReady={onReady} />);

    await user.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("still not detected");

    vi.mocked(getSevenZipStatus).mockResolvedValueOnce(readyStatus);
    await user.click(screen.getByRole("button", { name: "Check again" }));

    await waitFor(() => expect(onReady).toHaveBeenCalledWith(readyStatus));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps keyboard focus inside and restores it after Escape", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Configure archive engine</button>
          <SevenZipSetupDialog open={open} onClose={() => setOpen(false)} onReady={vi.fn()} />
        </>
      );
    }

    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Configure archive engine" });
    await user.click(trigger);

    expect(screen.getByRole("button", { name: "Open official download" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Not now" })).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
