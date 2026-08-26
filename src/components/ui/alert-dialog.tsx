import { CircleAlert } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";

interface AlertDialogProps {
  open: boolean;
  title: string;
  description: string;
  children?: ReactNode;
  closeLabel?: string;
  onClose: () => void;
}

export function AlertDialog({
  open,
  title,
  description,
  children,
  closeLabel = "Close",
  onClose,
}: AlertDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    dialogRef.current
      ?.querySelector<HTMLButtonElement>("[data-alert-dialog-close]")
      ?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-6 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          event.preventDefault();
          dialogRef.current
            ?.querySelector<HTMLButtonElement>("[data-alert-dialog-close]")
            ?.focus();
        }}
      >
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
            <CircleAlert className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-sm font-semibold">
              {title}
            </h2>
            <p id={descriptionId} className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>

        {children}

        <div className="mt-5 flex justify-end">
          <Button data-alert-dialog-close type="button" size="sm" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
