import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TaskCard } from "@/components/tasks/task-card";
import { retryTask } from "@/lib/tauri";
import { folderWatcherToTask } from "@/lib/task-utils";
import { useAppStore } from "@/store/app-store";
import { TASK_STATUSES, taskStatusLabel, type FolderWatcher, type Task, type TaskStatus } from "@/types/task";

vi.mock("@/lib/tauri", () => ({
  pauseTask: vi.fn(),
  resumeTask: vi.fn(),
  retryTask: vi.fn(),
}));

function createTask(status: TaskStatus): Task {
  return {
    id: status,
    name: `${taskStatusLabel[status]} example`,
    kind: "compress-upload",
    status,
    stage: status === "completed"
      ? "completed"
      : status === "failed"
        ? "failed"
        : status === "stopped"
          ? "stopped"
          : "queued",
    sourcePath: "C:\\Projects\\example",
    progress: status === "completed" ? 100 : 42,
    bytesProcessed: 42 * 1024,
    bytesTotal: 100 * 1024,
    retryCount: status === "failed" ? 2 : 0,
    errorMessage: status === "failed" ? "Network interrupted" : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("TaskCard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAppStore.setState({ tasks: [], removedTaskIds: [] });
  });

  it.each(TASK_STATUSES)("renders the %s visual state", (status) => {
    render(<TaskCard task={createTask(status)} />);

    expect(screen.getByText(`${taskStatusLabel[status]} example`)).toBeInTheDocument();
    expect(screen.getByText(taskStatusLabel[status])).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      status === "completed" ? "100" : "42",
    );
  });

  it("explains that a network-waiting task will resume automatically", () => {
    render(<TaskCard task={createTask("waiting_for_network")} />);

    expect(screen.getByText("Waiting for network")).toBeInTheDocument();
    expect(screen.getByText(
      "Resumes automatically when the connection returns",
    )).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("retries a failed regular task and stores the returned task", async () => {
    const failedTask = createTask("failed");
    const queuedTask: Task = {
      ...failedTask,
      status: "queued",
      stage: "queued",
      errorMessage: undefined,
      updatedAt: new Date(Date.now() + 1_000).toISOString(),
    };
    vi.mocked(retryTask).mockResolvedValue(queuedTask);
    useAppStore.setState({ tasks: [failedTask] });

    render(<TaskCard task={failedTask} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(retryTask).toHaveBeenCalledWith(failedTask.id);
    await waitFor(() => {
      expect(useAppStore.getState().tasks).toContainEqual(queuedTask);
    });
  });

  it("does not offer task retry for a failed watcher aggregate", () => {
    const watcherTask = createTask("failed");
    watcherTask.kind = "watcher";

    render(<TaskCard task={watcherTask} />);

    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("constrains long task content to the available card width", () => {
    const task = createTask("completed");
    task.sourcePath = `https://drive.google.com/file/d/${"a".repeat(180)}/view`;
    const { container } = render(<TaskCard task={task} />);

    expect(container.firstElementChild).toHaveClass(
      "w-full",
      "min-w-0",
      "max-w-full",
      "overflow-hidden",
    );
    expect(screen.getByTitle(task.sourcePath)).toHaveClass("truncate");
  });

  it("renders watcher counts and copies its folder link while running", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const watcher: FolderWatcher = {
      id: "watcher-one",
      name: "Render output",
      localPath: "C:\\Projects\\renders",
      driveFolderId: "drive-folder",
      driveFolderName: "Client delivery",
      enabled: true,
      status: "watching",
      settlingDelayMs: 3_000,
      includeExtensions: ["jpg"],
      excludePatterns: [],
      autoStopSeconds: 30,
      driveWebViewLink: "https://drive.google.com/drive/folders/drive-folder",
      filesDetected: 8,
      filesUploading: 2,
      filesUploaded: 5,
      filesFailed: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    render(<TaskCard task={folderWatcherToTask(watcher)} />);

    expect(screen.getByRole("heading", { name: "Render output" })).toBeInTheDocument();
    expect(screen.queryByText("Auto-upload Render output")).not.toBeInTheDocument();
    expect(screen.getByText("8 Detected")).toBeInTheDocument();
    expect(screen.getByText("5 Uploaded")).toBeInTheDocument();
    expect(screen.getByText("renders")).toHaveAttribute("title", watcher.localPath);
    expect(screen.getByText("Client delivery")).toHaveAttribute(
      "title",
      watcher.driveFolderName,
    );
    expect(screen.queryByText(watcher.driveFolderId!)).not.toBeInTheDocument();
    expect(screen.queryByText(watcher.driveWebViewLink!)).not.toBeInTheDocument();
    expect(screen.queryByText("2 Uploading")).not.toBeInTheDocument();
    expect(screen.getByText("63%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "62.5");
    expect(screen.queryByText("0 B / 0 B")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Copy folder link" }));
    expect(writeText).toHaveBeenCalledWith(watcher.driveWebViewLink);
  });

  it("does not render a legacy Drive folder ID when its name is unavailable", () => {
    const watcher: FolderWatcher = {
      id: "legacy-watcher",
      name: "Legacy watcher",
      localPath: "C:\\Projects\\legacy",
      driveFolderId: "0a7HHOsbWYMG-UGO7beVstXc",
      enabled: false,
      status: "stopped",
      settlingDelayMs: 3_000,
      includeExtensions: ["jpg"],
      excludePatterns: [],
      autoStopSeconds: 30,
      driveWebViewLink: "https://drive.google.com/drive/folders/0a7HHOsbWYMG-UGO7beVstXc",
      filesDetected: 1,
      filesUploading: 0,
      filesUploaded: 1,
      filesFailed: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    render(<TaskCard task={folderWatcherToTask(watcher)} />);

    expect(screen.getByText("Unknown folder")).toBeInTheDocument();
    expect(screen.queryByText(watcher.driveFolderId!)).not.toBeInTheDocument();
    expect(screen.queryByText(watcher.driveWebViewLink!)).not.toBeInTheDocument();
  });

  it("renders an empty stopped watcher without completed status or progress", () => {
    const watcher: FolderWatcher = {
      id: "empty-watcher",
      name: "Empty output",
      localPath: "C:\\Projects\\empty-output",
      driveFolderId: "drive-folder",
      enabled: false,
      status: "stopped",
      settlingDelayMs: 3_000,
      includeExtensions: ["jpg"],
      excludePatterns: [],
      autoStopSeconds: 30,
      filesDetected: 0,
      filesUploading: 0,
      filesUploaded: 0,
      filesFailed: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    render(<TaskCard task={folderWatcherToTask(watcher)} />);

    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});
