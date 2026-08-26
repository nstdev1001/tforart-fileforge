import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewCompressUploadForm } from "@/components/tasks/new-compress-upload-form";
import {
  getSevenZipStatus,
  listGoogleDriveFolder,
  pickFolder,
  setSevenZipPath,
  startCompressUpload,
} from "@/lib/tauri";

vi.mock("@/lib/tauri", () => ({
  createGoogleDriveFolder: vi.fn(),
  getSevenZipStatus: vi.fn(),
  listGoogleDriveFolder: vi.fn(),
  openSevenZipDownloadPage: vi.fn(),
  pickFolder: vi.fn(),
  setSevenZipPath: vi.fn(),
  startCompressUpload: vi.fn(),
}));

describe("NewCompressUploadForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSevenZipStatus).mockResolvedValue({ available: true, version: "7-Zip 24" });
  });

  it("uses the shared Drive browser to choose an upload destination", async () => {
    vi.mocked(listGoogleDriveFolder)
      .mockResolvedValueOnce({
        files: [{
          id: "delivery-folder",
          name: "Client delivery",
          mimeType: "application/vnd.google-apps.folder",
          parents: ["root"],
          shared: false,
          trashed: false,
        }],
      })
      .mockResolvedValueOnce({ files: [] });
    const user = userEvent.setup();

    render(<NewCompressUploadForm onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Browse Drive" }));
    await user.click(await screen.findByRole("button", { name: "Client delivery" }));
    await user.click(await screen.findByRole("button", { name: "Choose this folder" }));

    expect(screen.getByLabelText("Google Drive destination")).toHaveValue("Client delivery");
  });

  it("opens setup guidance instead of showing a raw missing-7-Zip error", async () => {
    vi.mocked(getSevenZipStatus).mockResolvedValue({ available: false });
    const user = userEvent.setup();

    render(<NewCompressUploadForm onClose={vi.fn()} />);

    expect(await screen.findByRole("alertdialog", { name: "7-Zip is required" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compress & upload" })).toBeDisabled();
    expect(screen.queryByText(/7-Zip was not found/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Not now" }));
    await user.click(screen.getByRole("button", { name: "Set up" }));
    expect(screen.getByRole("alertdialog", { name: "7-Zip is required" })).toBeInTheDocument();
  });

  it("enables compression immediately after a path is configured", async () => {
    vi.mocked(getSevenZipStatus).mockResolvedValue({ available: false });
    vi.mocked(setSevenZipPath).mockResolvedValue({
      available: true,
      path: "C:\\Tools\\7-Zip\\7z.exe",
      version: "7-Zip 26.02",
      source: "settings",
    });
    const user = userEvent.setup();

    render(<NewCompressUploadForm onClose={vi.fn()} />);
    await user.type(
      await screen.findByLabelText("Option 2 — Enter the path to 7z.exe"),
      "C:\\Tools\\7-Zip\\7z.exe",
    );
    await user.click(screen.getByRole("button", { name: "Save and verify" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByText("7-Zip 26.02")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compress & upload" })).toBeEnabled();
  });

  it("reopens setup when 7-Zip disappears after the preflight", async () => {
    vi.mocked(pickFolder).mockResolvedValue("C:\\Projects\\Delivery");
    vi.mocked(startCompressUpload).mockRejectedValue(
      "7-Zip was not found. Install 7-Zip or configure 7z.exe in Settings",
    );
    const user = userEvent.setup();
    render(<NewCompressUploadForm onClose={vi.fn()} />);

    await screen.findByText("7-Zip 24");
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await user.click(screen.getByRole("button", { name: "Compress & upload" }));

    expect(await screen.findByRole("alertdialog", { name: "7-Zip is required" })).toBeInTheDocument();
    expect(screen.queryByText(/7-Zip was not found/)).not.toBeInTheDocument();
  });
});
