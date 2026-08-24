import { invoke } from "@tauri-apps/api/core";

import type { DatabaseHealth, DiskSpace } from "@/types/system";

export async function pickFolder(): Promise<string | null> {
  return invoke<string | null>("pick_folder");
}

export async function getDiskFreeSpace(path: string): Promise<DiskSpace> {
  return invoke<DiskSpace>("get_disk_free_space", { path });
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  return invoke<DatabaseHealth>("get_database_health");
}

