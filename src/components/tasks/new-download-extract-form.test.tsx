import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewDownloadExtractForm } from "@/components/tasks/new-download-extract-form";
import {
  getSevenZipStatus,
  pickFolder,
  setSevenZipPath,
  startDownloadExtract,
} from "@/lib/tauri";

vi.mock("@/lib/tauri", () => ({
  getSevenZipStatus: vi.fn(),
  openSevenZipDownloadPage: vi.fn(),
  pickFolder: vi.fn(),
  setSevenZipPath: vi.fn(),
  startDownloadExtract: vi.fn(),
}));

describe("NewDownloadExtractForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("preflights 7-Zip and blocks extraction until setup is complete", async () => {
    vi.mocked(getSevenZipStatus).mockResolvedValue({ available: false });
    const user = userEvent.setup();
    render(<NewDownloadExtractForm onClose={vi.fn()} />);

    expect(await screen.findByRole("alertdialog", { name: "7-Zip is required" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download & extract" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.getByText("7-Zip is not configured")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up" })).toBeInTheDocument();
  });

  it("does not open the modal when 7-Zip is ready", async () => {
    vi.mocked(getSevenZipStatus).mockResolvedValue({
      available: true,
      path: "C:\\Program Files\\7-Zip\\7z.exe",
      version: "7-Zip 26.02",
    });
    render(<NewDownloadExtractForm onClose={vi.fn()} />);

    expect(await screen.findByText("7-Zip 26.02")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download & extract" })).toBeEnabled();
  });

  it("enables extraction immediately after a path is configured", async () => {
    vi.mocked(getSevenZipStatus).mockResolvedValue({ available: false });
    vi.mocked(setSevenZipPath).mockResolvedValue({
      available: true,
      path: "C:\\Tools\\7-Zip\\7z.exe",
      version: "7-Zip 26.02",
      source: "settings",
    });
    const user = userEvent.setup();
    render(<NewDownloadExtractForm onClose={vi.fn()} />);

    await user.type(
      await screen.findByLabelText("Option 2 — Enter the path to 7z.exe"),
      "C:\\Tools\\7-Zip\\7z.exe",
    );
    await user.click(screen.getByRole("button", { name: "Save and verify" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByText("7-Zip 26.02")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download & extract" })).toBeEnabled();
  });

  it("reopens setup when 7-Zip disappears after the preflight", async () => {
    vi.mocked(getSevenZipStatus).mockResolvedValue({
      available: true,
      path: "C:\\Program Files\\7-Zip\\7z.exe",
      version: "7-Zip 26.02",
    });
    vi.mocked(pickFolder).mockResolvedValue("C:\\Downloads");
    vi.mocked(startDownloadExtract).mockRejectedValue(
      "7-Zip was not found. Install 7-Zip or configure 7z.exe in Settings",
    );
    const user = userEvent.setup();
    render(<NewDownloadExtractForm onClose={vi.fn()} />);

    await screen.findByText("7-Zip 26.02");
    await user.type(
      screen.getByLabelText("Google Drive ZIP link or file ID"),
      "https://drive.google.com/file/d/archive/view",
    );
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Download & extract" }));

    expect(await screen.findByRole("alertdialog", { name: "7-Zip is required" })).toBeInTheDocument();
    expect(screen.queryByText(/7-Zip was not found/)).not.toBeInTheDocument();
  });
});
