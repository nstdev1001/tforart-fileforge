export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "up-to-date"
  | "error";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

export interface UpdateDownloadProgress {
  percentage: number;
  downloadedBytes: number;
  totalBytes: number;
}
