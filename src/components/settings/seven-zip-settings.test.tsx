import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SevenZipSettings } from "@/components/settings/seven-zip-settings";
import { getSevenZipStatus, setSevenZipPath } from "@/lib/tauri";

vi.mock("@/lib/tauri", () => ({
  getSevenZipStatus: vi.fn(),
  openSevenZipDownloadPage: vi.fn(),
  setSevenZipPath: vi.fn(),
}));

describe("SevenZipSettings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("moves missing-engine remediation into the setup modal", async () => {
    vi.mocked(getSevenZipStatus).mockResolvedValue({ available: false });

    render(<SevenZipSettings />);

    expect(await screen.findByRole("alertdialog", { name: "7-Zip is required" })).toBeInTheDocument();
    expect(screen.getByText("Not detected")).toBeInTheDocument();
    expect(screen.getByText("Install 7-Zip or provide the full path to 7z.exe.")).toBeInTheDocument();
  });

  it("updates the settings card after configuring a valid executable", async () => {
    vi.mocked(getSevenZipStatus).mockResolvedValue({ available: false });
    vi.mocked(setSevenZipPath).mockResolvedValue({
      available: true,
      path: "C:\\Apps\\7-Zip\\7z.exe",
      version: "7-Zip 26.02",
      source: "settings",
    });
    const user = userEvent.setup();
    render(<SevenZipSettings />);

    await user.type(
      await screen.findByLabelText("Option 2 — Enter the path to 7z.exe"),
      "C:\\Apps\\7-Zip\\7z.exe",
    );
    await user.click(screen.getByRole("button", { name: "Save and verify" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("7-Zip 26.02")).toBeInTheDocument();
    expect(screen.getByText("C:\\Apps\\7-Zip\\7z.exe")).toBeInTheDocument();
  });
});
