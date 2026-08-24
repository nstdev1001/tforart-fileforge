export interface DiskSpace {
  path: string;
  mountPoint: string;
  totalBytes: number;
  freeBytes: number;
}

export interface DatabaseHealth {
  path: string;
  schemaVersion: number;
  status: string;
}

