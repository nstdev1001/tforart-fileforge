import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUpdaterStore } from "@/store/updater-store";

export function UpdaterSettings() {
  const status = useUpdaterStore((state) => state.status);
  const currentAppVersion = useUpdaterStore((state) => state.currentAppVersion);
  const updateInfo = useUpdaterStore((state) => state.updateInfo);
  const lastCheckedAt = useUpdaterStore((state) => state.lastCheckedAt);
  const errorMessage = useUpdaterStore((state) => state.errorMessage);
  const checkForUpdates = useUpdaterStore((state) => state.checkForUpdates);
  const setModalOpen = useUpdaterStore((state) => state.setModalOpen);

  const isChecking = status === "checking";
  const hasUpdate = status === "available" && Boolean(updateInfo);
  const currentVersionStr = currentAppVersion.startsWith("v")
    ? currentAppVersion
    : `v${currentAppVersion}`;

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3 border-b border-border/70">
        <Sparkles className="mt-0.5 size-5 text-primary" />
        <div className="flex-1">
          <CardTitle>Cập nhật ứng dụng</CardTitle>
          <CardDescription>
            Kiểm tra và nâng cấp trực tiếp Tforart FileForge lên phiên bản mới nhất.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                Phiên bản hiện tại:
              </span>
              <span className="font-mono text-xs font-bold text-primary">
                {currentVersionStr}
              </span>
              {hasUpdate ? (
                <Badge
                  variant="default"
                  className="text-[10px]"
                >
                  Có bản mới: {updateInfo?.version}
                </Badge>
              ) : status === "up-to-date" ? (
                <Badge
                  variant="success"
                  className="text-[10px]"
                >
                  Mới nhất
                </Badge>
              ) : null}
            </div>

            <div className="text-[11px] text-muted-foreground">
              {isChecking ? (
                <span className="flex items-center gap-1.5 text-primary">
                  <Loader2 className="size-3 animate-spin" />
                  Đang kiểm tra bản cập nhật trên máy chủ...
                </span>
              ) : hasUpdate ? (
                <span className="text-primary font-medium">
                  Phiên bản {updateInfo?.version} đã sẵn sàng để cài đặt.
                </span>
              ) : status === "up-to-date" ? (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" />
                  Bạn đang sử dụng phiên bản mới nhất của ứng dụng.
                </span>
              ) : status === "error" ? (
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <AlertCircle className="size-3" />
                  {errorMessage || "Không thể kiểm tra cập nhật. Vui lòng thử lại sau."}
                </span>
              ) : (
                <span>
                  Tự động kiểm tra phiên bản mới định kỳ và thông báo an toàn.
                </span>
              )}
            </div>

            {lastCheckedAt && (
              <p className="text-[10px] text-muted-foreground/70">
                Kiểm tra gần nhất: {lastCheckedAt.toLocaleTimeString("vi-VN")}{" "}
                {lastCheckedAt.toLocaleDateString("vi-VN")}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasUpdate && (
              <Button
                type="button"
                size="sm"
                onClick={() => setModalOpen(true)}
                className="gap-1.5 shadow-sm"
              >
                <Download className="size-3.5" />
                Xem bản cập nhật
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isChecking}
              onClick={() => checkForUpdates(true)}
              className="gap-1.5"
            >
              <RefreshCw
                className={`size-3.5 ${isChecking ? "animate-spin text-primary" : ""}`}
              />
              {isChecking ? "Đang kiểm tra..." : "Kiểm tra cập nhật"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-muted/30 p-3.5 text-[11px] leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground/80 mb-0.5">
            Quy tắc an toàn khi cập nhật:
          </p>
          <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
            <li>FileForge không bao giờ tự động khởi động lại khi có tác vụ nén, giải nén hay truyền tải file đang chạy.</li>
            <li>Bạn luôn được xem danh sách thay đổi (Changelog) và chủ động bấm nút cho phép cập nhật.</li>
            <li>Gói cập nhật được ký số xác thực an toàn trước khi thay thế bản cũ.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
