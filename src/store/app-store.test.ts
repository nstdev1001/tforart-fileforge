import { beforeEach, describe, expect, it } from "vitest";

import { useAppStore } from "@/store/app-store";
import type { Task } from "@/types/task";

function task({
  id,
  createdAt,
  updatedAt,
  ...overrides
}: Partial<Task> & Pick<Task, "id" | "createdAt" | "updatedAt">): Task {
  return {
    id,
    name: id,
    kind: "compress-upload",
    status: "running",
    stage: "uploading",
    sourcePath: `C:\\Projects\\${id}`,
    progress: 0,
    bytesProcessed: 0,
    bytesTotal: 100,
    retryCount: 0,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

describe("app task store", () => {
  beforeEach(() => {
    useAppStore.setState({ tasks: [], removedTaskIds: [] });
  });

  it("keeps tasks newest-created-first while updating their progress independently", () => {
    const older = task({
      id: "older-task",
      createdAt: "2026-08-25T08:00:00.000Z",
      updatedAt: "2026-08-25T08:04:00.000Z",
      progress: 10,
    });
    const newer = task({
      id: "newer-task",
      createdAt: "2026-08-25T08:01:00.000Z",
      updatedAt: "2026-08-25T08:01:00.000Z",
      progress: 20,
    });

    useAppStore.getState().mergeTasks([older, newer]);
    expect(useAppStore.getState().tasks.map(({ id }) => id)).toEqual([
      "newer-task",
      "older-task",
    ]);

    useAppStore.getState().upsertTask({
      ...older,
      progress: 35,
      updatedAt: "2026-08-25T08:05:00.000Z",
    });
    useAppStore.getState().upsertTask({
      ...newer,
      progress: 70,
      updatedAt: "2026-08-25T08:06:00.000Z",
    });

    const updatedTasks = useAppStore.getState().tasks;
    expect(updatedTasks.map(({ id }) => id)).toEqual(["newer-task", "older-task"]);
    expect(updatedTasks.find(({ id }) => id === "older-task")?.progress).toBe(35);
    expect(updatedTasks.find(({ id }) => id === "newer-task")?.progress).toBe(70);

    useAppStore.getState().upsertTask(task({
      id: "latest-task",
      createdAt: "2026-08-25T08:02:00.000Z",
      updatedAt: "2026-08-25T08:02:00.000Z",
    }));
    expect(useAppStore.getState().tasks.map(({ id }) => id)).toEqual([
      "latest-task",
      "newer-task",
      "older-task",
    ]);
  });
});
