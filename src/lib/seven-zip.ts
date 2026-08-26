import type { SevenZipStatus } from "@/lib/tauri";

export const unavailableSevenZipStatus: SevenZipStatus = {
  available: false,
};

export function toErrorMessage(error: unknown): string {
  return typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "Unexpected native error";
}

export function isMissingSevenZipError(error: unknown): boolean {
  const message = toErrorMessage(error);
  return message.includes("7-Zip was not found") || message.includes("could not start 7-Zip");
}
