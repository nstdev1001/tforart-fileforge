import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TaskCard } from "@/components/tasks/task-card";
import { TASK_STATUSES, taskStatusLabel, type Task, type TaskStatus } from "@/types/task";

function createTask(status: TaskStatus): Task {
  return {
    id: status,
    name: `${taskStatusLabel[status]} example`,
    kind: "compress-upload",
    status,
    stage: status === "completed" ? "completed" : status === "failed" ? "failed" : "queued",
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
  it.each(TASK_STATUSES)("renders the %s visual state", (status) => {
    render(<TaskCard task={createTask(status)} />);

    expect(screen.getByText(`${taskStatusLabel[status]} example`)).toBeInTheDocument();
    expect(screen.getByText(taskStatusLabel[status])).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      status === "completed" ? "100" : "42",
    );
  });
});
