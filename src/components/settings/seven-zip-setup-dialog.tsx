import { Archive, ExternalLink, LoaderCircle, RefreshCw, Save } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getSevenZipStatus,
  openSevenZipDownloadPage,
  setSevenZipPath,
  type SevenZipStatus,
} from "@/lib/tauri";
import { toErrorMessage } from "@/lib/seven-zip";

const DOWNLOAD_URL = "https://www.7-zip.org/download.html";

interface SevenZipSetupDialogProps {
  open: boolean;
  currentPath?: string | null;
  issue?: string | null;
  onClose: () => void;
  onReady: (status: SevenZipStatus) => void;
}

type DialogAction = "download" | "check" | "save";

export function SevenZipSetupDialog({
  open,
  currentPath,
  issue,
  onClose,
  onReady,
}: SevenZipSetupDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const actionRef = useRef<DialogAction | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const pathId = useId();
  const [path, setPath] = useState("");
  const [action, setAction] = useState<DialogAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    setPath(currentPath ?? "");
    actionRef.current = null;
    setAction(null);
    setError(issue ?? null);
    setNotice(null);

    dialogRef.current
      ?.querySelector<HTMLButtonElement>("[data-seven-zip-initial-focus]")
      ?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && actionRef.current === null) onCloseRef.current();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [currentPath, issue, open]);

  function keepFocusInside(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled)",
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function finish(status: SevenZipStatus) {
    onReady(status);
    onClose();
  }

  function updateAction(nextAction: DialogAction | null) {
    actionRef.current = nextAction;
    setAction(nextAction);
  }

  async function downloadSevenZip() {
    updateAction("download");
    setError(null);
    setNotice(null);
    try {
      await openSevenZipDownloadPage();
      setNotice("The official download page is open. Install 7-Zip, then choose Check again.");
    } catch (reason) {
      setError(toErrorMessage(reason));
    } finally {
      updateAction(null);
    }
  }

  async function checkAgain() {
    updateAction("check");
    setError(null);
    setNotice(null);
    try {
      const status = await getSevenZipStatus();
      if (status.available) {
        finish(status);
      } else {
        setError("7-Zip is still not detected. Finish the installation or enter the path to 7z.exe below.");
      }
    } catch (reason) {
      setError(toErrorMessage(reason));
    } finally {
      updateAction(null);
    }
  }

  async function savePath(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      setError("Enter the full path to 7z.exe.");
      return;
    }

    updateAction("save");
    setError(null);
    setNotice(null);
    try {
      const status = await setSevenZipPath(trimmedPath);
      if (!status.available) {
        setError("The selected executable could not be verified as 7-Zip.");
        return;
      }
      finish(status);
    } catch (reason) {
      setError(toErrorMessage(reason));
    } finally {
      updateAction(null);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-black/50 p-5 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && actionRef.current === null) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="max-h-[calc(100vh-2.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl"
        onKeyDown={keepFocusInside}
      >
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300">
            <Archive className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-sm font-semibold">
              {currentPath ? "Configure 7-Zip" : "7-Zip is required"}
            </h2>
            <p id={descriptionId} className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {currentPath
                ? "Choose a different 7z.exe or verify the installation that FileForge is currently using."
                : "FileForge needs 7-Zip to create and extract ZIP archives. Install it from the official site or configure an existing 7z.exe."}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-border/70 bg-muted/45 p-4">
          <p className="text-xs font-semibold">Option 1 — Install 7-Zip</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Download the Windows installer from <span className="font-medium text-foreground">{DOWNLOAD_URL}</span>. After installation, return here and check again.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              data-seven-zip-initial-focus
              type="button"
              size="sm"
              onClick={downloadSevenZip}
              disabled={action !== null}
            >
              {action === "download" ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
              Open official download
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={checkAgain} disabled={action !== null}>
              {action === "check" ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Check again
            </Button>
          </div>
        </div>

        <form className="mt-4 rounded-xl border border-border/70 p-4" onSubmit={savePath}>
          <label htmlFor={pathId} className="text-xs font-semibold">Option 2 — Enter the path to 7z.exe</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <Input
              id={pathId}
              value={path}
              onChange={(event) => setPath(event.target.value)}
              readOnly={action !== null}
              placeholder="C:\\Program Files\\7-Zip\\7z.exe"
              autoComplete="off"
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={action !== null || !path.trim()}>
              {action === "save" ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save and verify
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            The file must exist and its name must be 7z.exe.
          </p>
        </form>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-4 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            {notice}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={action !== null}>
            Not now
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
