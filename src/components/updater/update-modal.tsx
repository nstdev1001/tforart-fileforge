import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Loader2,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/utils";
import { useUpdaterStore } from "@/store/updater-store";

export function UpdateModal() {
  const modalOpen = useUpdaterStore((state) => state.modalOpen);
  const setModalOpen = useUpdaterStore((state) => state.setModalOpen);
  const status = useUpdaterStore((state) => state.status);
  const currentAppVersion = useUpdaterStore((state) => state.currentAppVersion);
  const updateInfo = useUpdaterStore((state) => state.updateInfo);
  const downloadProgress = useUpdaterStore((state) => state.downloadProgress);
  const downloadedBytes = useUpdaterStore((state) => state.downloadedBytes);
  const totalBytes = useUpdaterStore((state) => state.totalBytes);
  const errorMessage = useUpdaterStore((state) => state.errorMessage);
  const downloadAndInstallUpdate = useUpdaterStore(
    (state) => state.downloadAndInstallUpdate,
  );
  const restartApp = useUpdaterStore((state) => state.restartApp);
  const resetError = useUpdaterStore((state) => state.resetError);

  const dialogRef = useRef<HTMLDivElement>(null);
  const isDownloading = status === "downloading";

  useEffect(() => {
    if (!modalOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isDownloading) {
        setModalOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen, isDownloading, setModalOpen]);

  if (!modalOpen || typeof document === "undefined" || !updateInfo) {
    return null;
  }

  const newVersion = updateInfo.version.startsWith("v")
    ? updateInfo.version
    : `v${updateInfo.version}`;
  const currentVersion = currentAppVersion.startsWith("v")
    ? currentAppVersion
    : `v${currentAppVersion}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDownloading) {
          setModalOpen(false);
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border/80 bg-card p-6 text-card-foreground shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Close Button */}
        {!isDownloading && (
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            aria-label="Đóng"
            className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}

        {/* Header with Icon and Title */}
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner">
            <Sparkles className="size-6 animate-pulse" />
          </div>

          <div className="min-w-0 flex-1 pr-6">
            <div className="flex items-center gap-2">
              <h2
                id="update-dialog-title"
                className="text-base font-semibold tracking-tight text-foreground"
              >
                Cập nhật Tforart FileForge
              </h2>
              <Badge variant="default" className="text-[10px]">
                Mới
              </Badge>
            </div>

            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-mono">{currentVersion}</span>
              <ArrowRight className="size-3 text-muted-foreground/60" />
              <span className="font-mono font-semibold text-primary">{newVersion}</span>
              {updateInfo.date && (
                <span className="ml-2 text-[11px] text-muted-foreground/80">
                  • {new Date(updateInfo.date).toLocaleDateString("vi-VN")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Changelog / Release Notes */}
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold text-foreground">
            Thông tin phiên bản mới:
          </p>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-border/70 bg-muted/40 p-3.5 text-xs text-muted-foreground leading-relaxed">
            <div className="whitespace-pre-line select-text">
              {updateInfo.body || "Các cải tiến hiệu năng và bản vá lỗi mới nhất cho Tforart FileForge."}
            </div>
          </div>
        </div>

        {/* Progress or Download Status */}
        {isDownloading && (
          <div className="mt-5 space-y-2.5 rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                Đang tải gói cài đặt...
              </span>
              <span className="font-mono font-semibold text-primary">
                {downloadProgress}%
              </span>
            </div>

            <Progress value={downloadProgress} className="h-2" />

            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{formatBytes(downloadedBytes)}</span>
              {totalBytes > 0 && <span>{formatBytes(totalBytes)}</span>}
            </div>
          </div>
        )}

        {/* Downloaded / Ready to Restart */}
        {status === "downloaded" && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] p-4 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="text-xs">
              <p className="font-semibold">Đã tải bản cập nhật thành công!</p>
              <p className="mt-0.5 text-[11px] text-emerald-800/80 dark:text-emerald-200/80">
                Khởi động lại ứng dụng để hoàn tất việc cài đặt phiên bản mới.
              </p>
            </div>
          </div>
        )}

        {/* Error message */}
        {status === "error" && errorMessage && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/[0.08] p-3.5 text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
            <div className="flex-1 text-xs">
              <p className="font-semibold">Không thể cập nhật</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-red-800/80 dark:text-red-200/80">
                {errorMessage}
              </p>
            </div>
          </div>
        )}

        {/* Actions Footer */}
        <div className="mt-6 flex items-center justify-end gap-2.5">
          {status === "downloaded" ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(false)}
              >
                Khởi động lại sau
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={() => restartApp()}
              >
                <RotateCw className="size-3.5" />
                Khởi động lại ngay
              </Button>
            </>
          ) : isDownloading ? (
            <Button type="button" size="sm" disabled className="gap-2">
              <Loader2 className="size-3.5 animate-spin" />
              Đang tải...
            </Button>
          ) : status === "error" ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  resetError();
                  setModalOpen(false);
                }}
              >
                Đóng
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={() => downloadAndInstallUpdate()}
              >
                <RotateCw className="size-3.5" />
                Thử lại
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setModalOpen(false)}
              >
                Để sau
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5 shadow-sm"
                onClick={() => downloadAndInstallUpdate()}
              >
                <Download className="size-3.5" />
                Cập nhật ngay
              </Button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
