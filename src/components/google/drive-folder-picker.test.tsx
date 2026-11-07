import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DriveFolderPicker } from "@/components/google/drive-folder-picker";
import {
  connectGoogleDrive,
  createGoogleDriveFolder,
  disconnectGoogleDrive,
  listGoogleDriveFolder,
} from "@/lib/tauri";
import type { DriveFile } from "@/types/drive";

vi.mock("@/lib/tauri", () => ({
  connectGoogleDrive: vi.fn(),
  disconnectGoogleDrive: vi.fn(),
  createGoogleDriveFolder: vi.fn(),
  listGoogleDriveFolder: vi.fn(),
}));

const folder = (id: string, name: string): DriveFile => ({
  id,
  name,
  mimeType: "application/vnd.google-apps.folder",
  parents: ["root"],
  shared: false,
  trashed: false,
});

const file = (id: string, name: string): DriveFile => ({
  id,
  name,
  mimeType: "application/zip",
  parents: ["root"],
  shared: false,
  trashed: false,
});

describe("DriveFolderPicker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("navigates folders and returns the current folder", async () => {
    vi.mocked(listGoogleDriveFolder)
      .mockResolvedValueOnce({ files: [folder("projects", "Projects"), file("archive", "old.zip")] })
      .mockResolvedValueOnce({ files: [] });
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(<DriveFolderPicker open onClose={vi.fn()} onSelect={onSelect} />);

    expect(await screen.findByRole("button", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByText("old.zip")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "old.zip" })).not.toBeInTheDocument();
    expect(listGoogleDriveFolder).toHaveBeenNthCalledWith(1, "root", undefined);

    await user.click(screen.getByRole("button", { name: "Projects" }));
    await waitFor(() => expect(listGoogleDriveFolder).toHaveBeenNthCalledWith(2, "projects", undefined));
    expect(await screen.findByText("This folder is empty")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Choose this folder" }));
    expect(onSelect).toHaveBeenCalledWith({ id: "projects", name: "Projects" });
  });

  it("signs out an expired session and reconnects from the picker", async () => {
    vi.mocked(listGoogleDriveFolder)
      .mockRejectedValueOnce("token exchange failed: invalid_grant: Token has been expired or revoked.")
      .mockResolvedValueOnce({ files: [folder("projects", "Projects")] });
    vi.mocked(disconnectGoogleDrive).mockResolvedValue(undefined);
    vi.mocked(connectGoogleDrive).mockResolvedValue({} as never);
    const user = userEvent.setup();

    render(<DriveFolderPicker open onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(await screen.findByText("Google Drive connection lost")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(disconnectGoogleDrive).toHaveBeenCalledTimes(1);
    expect(listGoogleDriveFolder).toHaveBeenCalledTimes(1);

    await user.click(await screen.findByRole("button", { name: "Connect Google Drive" }));
    expect(connectGoogleDrive).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Projects" })).toBeInTheDocument();
  });

  it("only reloads on non-auth errors", async () => {
    vi.mocked(listGoogleDriveFolder)
      .mockRejectedValueOnce("network unreachable")
      .mockResolvedValueOnce({ files: [] });
    const user = userEvent.setup();

    render(<DriveFolderPicker open onClose={vi.fn()} onSelect={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(disconnectGoogleDrive).not.toHaveBeenCalled();
    expect(await screen.findByText("This folder is empty")).toBeInTheDocument();
  });

  it("appends paginated folders without duplicates", async () => {
    vi.mocked(listGoogleDriveFolder)
      .mockResolvedValueOnce({ files: [folder("one", "Folder one")], nextPageToken: "next-page" })
      .mockResolvedValueOnce({ files: [folder("one", "Folder one"), folder("two", "Folder two")] });
    const user = userEvent.setup();

    render(<DriveFolderPicker open onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Folder one" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("button", { name: "Folder two" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Folder one" })).toHaveLength(1);
    expect(listGoogleDriveFolder).toHaveBeenNthCalledWith(2, "root", "next-page");
  });

  it("creates a folder in the current location and opens it", async () => {
    vi.mocked(listGoogleDriveFolder)
      .mockResolvedValueOnce({ files: [] })
      .mockResolvedValueOnce({ files: [] });
    vi.mocked(createGoogleDriveFolder).mockResolvedValue(folder("new-folder", "Client delivery"));
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(<DriveFolderPicker open onClose={vi.fn()} onSelect={onSelect} />);

    expect(await screen.findByText("This folder is empty")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.type(screen.getByLabelText("New folder name"), "  Client delivery  ");
    await user.click(screen.getByRole("button", { name: "Create folder" }));

    await waitFor(() => expect(createGoogleDriveFolder).toHaveBeenCalledWith("Client delivery", "root"));
    await waitFor(() => expect(listGoogleDriveFolder).toHaveBeenNthCalledWith(2, "new-folder", undefined));
    await user.click(await screen.findByRole("button", { name: "Choose this folder" }));
    expect(onSelect).toHaveBeenCalledWith({ id: "new-folder", name: "Client delivery" });
  });

  it("keeps the new-folder form open when Drive rejects creation", async () => {
    vi.mocked(listGoogleDriveFolder).mockResolvedValue({ files: [] });
    vi.mocked(createGoogleDriveFolder).mockRejectedValue("Google Drive API returned HTTP 403");
    const user = userEvent.setup();

    render(<DriveFolderPicker open onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(await screen.findByText("This folder is empty")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New folder" }));
    await user.type(screen.getByLabelText("New folder name"), "Restricted folder");
    await user.click(screen.getByRole("button", { name: "Create folder" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 403");
    expect(screen.getByLabelText("New folder name")).toHaveValue("Restricted folder");
    expect(screen.getByText(/Destination:/)).toHaveTextContent("My Drive");
  });
});
