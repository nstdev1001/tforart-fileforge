import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewCompressUploadForm } from "@/components/tasks/new-compress-upload-form";
import { getSevenZipStatus, listGoogleDriveFolder } from "@/lib/tauri";

vi.mock("@/lib/tauri", () => ({
  createGoogleDriveFolder: vi.fn(),
  getSevenZipStatus: vi.fn(),
  listGoogleDriveFolder: vi.fn(),
  pickFolder: vi.fn(),
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
});
