import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUpdaterStore } from "@/store/updater-store";

export function UpdateBanner() {
  const status = useUpdaterStore((state) => state.status);
  const updateInfo = useUpdaterStore((state) => state.updateInfo);
  const modalOpen = useUpdaterStore((state) => state.modalOpen);
  const bannerDismissed = useUpdaterStore((state) => state.bannerDismissed);
  const setModalOpen = useUpdaterStore((state) => state.setModalOpen);
  const setBannerDismissed = useUpdaterStore((state) => state.setBannerDismissed);

  if (
    modalOpen ||
    bannerDismissed ||
    status !== "available" ||
    !updateInfo
  ) {
    return null;
  }

  const newVersion = updateInfo.version.startsWith("v")
    ? updateInfo.version
    : `v${updateInfo.version}`;

  return (
    <aside
      aria-label="Thông báo cập nhật ứng dụng"
      className="fixed bottom-5 right-5 z-[90] flex max-w-sm items-center gap-3 rounded-2xl border border-primary/25 bg-card/95 p-3.5 pl-4 text-card-foreground shadow-xl backdrop-blur-md animate-in slide-in-from-bottom-4 duration-300"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Sparkles className="size-4.5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">
          Bản cập nhật {newVersion} đã sẵn sàng
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          Nâng cấp để trải nghiệm các tính năng mới
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs font-medium px-3"
          onClick={() => setModalOpen(true)}
        >
          Xem chi tiết
        </Button>
        <button
          type="button"
          aria-label="Đóng thông báo cập nhật"
          onClick={() => setBannerDismissed(true)}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </aside>
  );
}
