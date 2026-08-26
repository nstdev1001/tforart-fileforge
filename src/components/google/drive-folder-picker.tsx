import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  File,
  Folder,
  FolderCheck,
  FolderPlus,
  LoaderCircle,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createGoogleDriveFolder, listGoogleDriveFolder } from "@/lib/tauri";
import { formatBytes } from "@/lib/utils";
import type { DriveFile } from "@/types/drive";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const ROOT_FOLDER: DriveFolderSelection = { id: "root", name: "My Drive" };

export interface DriveFolderSelection {
  id: string;
  name: string;
}

interface DriveFolderPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (folder: DriveFolderSelection) => void;
}

export function DriveFolderPicker({ open, onClose, onSelect }: DriveFolderPickerProps) {
  const [path, setPath] = useState<DriveFolderSelection[]>([ROOT_FOLDER]);
  const [items, setItems] = useState<DriveFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewFolderForm, setShowNewFolderForm] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [createFolderError, setCreateFolderError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  const currentFolder = path.at(-1) ?? ROOT_FOLDER;
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) => item.name.toLocaleLowerCase().includes(normalizedQuery));
  }, [items, query]);

  const loadFolder = useCallback(async (
    folderId: string,
    pageToken?: string,
    append = false,
  ) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    if (!append) {
      setItems([]);
      setNextPageToken(undefined);
    }
    try {
      const page = await listGoogleDriveFolder(folderId, pageToken);
      if (requestId !== requestIdRef.current) return;
      setItems((current) => append
        ? [...current, ...page.files.filter((item) => !current.some((existing) => existing.id === item.id))]
        : page.files);
      setNextPageToken(page.nextPageToken);
    } catch (reason) {
      if (requestId !== requestIdRef.current) return;
      setError(toMessage(reason));
      if (!append) setItems([]);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      requestIdRef.current += 1;
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    setPath([ROOT_FOLDER]);
    setQuery("");
    setShowNewFolderForm(false);
    setNewFolderName("");
    setCreateFolderError(null);
    void loadFolder(ROOT_FOLDER.id);

    window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>("[data-drive-picker-close]")?.focus();
    });

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [loadFolder, open]);

  function openFolder(folder: DriveFile) {
    const nextFolder = { id: folder.id, name: folder.name };
    setPath((current) => [...current, nextFolder]);
    setQuery("");
    setShowNewFolderForm(false);
    setNewFolderName("");
    setCreateFolderError(null);
    void loadFolder(nextFolder.id);
  }

  function openPathIndex(index: number) {
    const nextPath = path.slice(0, index + 1);
    const folder = nextPath.at(-1) ?? ROOT_FOLDER;
    setPath(nextPath);
    setQuery("");
    setShowNewFolderForm(false);
    setNewFolderName("");
    setCreateFolderError(null);
    void loadFolder(folder.id);
  }

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name) {
      setCreateFolderError("Enter a folder name.");
      return;
    }

    setCreatingFolder(true);
    setCreateFolderError(null);
    try {
      const folder = await createGoogleDriveFolder(name, currentFolder.id);
      openFolder(folder);
    } catch (reason) {
      setCreateFolderError(toMessage(reason));
    } finally {
      setCreatingFolder(false);
    }
  }

  function keepFocusInside(event: React.KeyboardEvent<HTMLDivElement>) {
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
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="flex max-h-[min(680px,calc(100vh-3rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
        onKeyDown={keepFocusInside}
      >
        <div className="flex items-start gap-3 border-b border-border/70 p-5">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Cloud className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-sm font-semibold">Choose a Google Drive folder</h2>
            <p id={descriptionId} className="mt-1 text-xs text-muted-foreground">
              Browse the connected Drive account. Only folders can be selected as a destination.
            </p>
          </div>
          <Button
            data-drive-picker-close
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Close Drive browser"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Go back"
            disabled={path.length === 1 || loading}
            onClick={() => openPathIndex(path.length - 2)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Refresh folder"
            disabled={loading}
            onClick={() => void loadFolder(currentFolder.id)}
          >
            <RefreshCw className="size-4" />
          </Button>
          <nav className="flex min-w-0 flex-1 items-center overflow-x-auto" aria-label="Drive folder path">
            {path.map((folder, index) => (
              <div key={`${folder.id}-${index}`} className="flex shrink-0 items-center">
                {index > 0 ? <ChevronRight className="mx-0.5 size-3.5 text-muted-foreground" /> : null}
                <button
                  type="button"
                  className="rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-accent disabled:cursor-default disabled:text-foreground"
                  disabled={index === path.length - 1 || loading}
                  onClick={() => openPathIndex(index)}
                >
                  {folder.name}
                </button>
              </div>
            ))}
          </nav>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || creatingFolder}
            onClick={() => {
              setShowNewFolderForm(true);
              setCreateFolderError(null);
            }}
          >
            <FolderPlus className="size-3.5" /> New folder
          </Button>
        </div>

        {showNewFolderForm ? (
          <form className="border-b border-border/70 bg-primary/[0.04] px-5 py-3" onSubmit={createFolder}>
            <label className="text-xs font-semibold" htmlFor="new-drive-folder-name">New folder name</label>
            <div className="mt-2 flex gap-2">
              <Input
                id="new-drive-folder-name"
                autoFocus
                maxLength={255}
                value={newFolderName}
                disabled={creatingFolder}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="Untitled folder"
              />
              <Button
                type="button"
                variant="ghost"
                disabled={creatingFolder}
                onClick={() => {
                  setShowNewFolderForm(false);
                  setNewFolderName("");
                  setCreateFolderError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creatingFolder || !newFolderName.trim()}>
                {creatingFolder ? <LoaderCircle className="size-4 animate-spin" /> : <FolderPlus className="size-4" />}
                {creatingFolder ? "Creating..." : "Create folder"}
              </Button>
            </div>
            {createFolderError ? <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-300">{createFolderError}</p> : null}
          </form>
        ) : null}

        <div className="border-b border-border/70 px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Filter Drive items"
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter items in this location"
            />
          </div>
        </div>

        <div className="min-h-64 flex-1 overflow-y-auto p-3" aria-live="polite">
          {error ? (
            <div className="grid min-h-56 place-items-center px-6 text-center">
              <div>
                <p className="text-sm font-semibold">Could not load this folder</p>
                <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-300">{error}</p>
                <Button className="mt-4" type="button" variant="outline" size="sm" onClick={() => void loadFolder(currentFolder.id)}>
                  <RefreshCw className="size-3.5" /> Try again
                </Button>
              </div>
            </div>
          ) : loading && items.length === 0 ? (
            <div className="grid min-h-56 place-items-center text-xs text-muted-foreground">
              <span className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" /> Loading Drive items...</span>
            </div>
          ) : visibleItems.length ? (
            <div className="grid gap-1 sm:grid-cols-2">
              {visibleItems.map((item) => item.mimeType === FOLDER_MIME ? (
                <button
                  key={item.id}
                  type="button"
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => openFolder(item)}
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Folder className="size-[18px] fill-current/15" />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.name}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ) : (
                <div key={item.id} className="flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <File className="size-[18px]" />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{item.name}</span>
                  {item.size ? <span className="shrink-0 text-[10px] text-muted-foreground">{formatBytes(Number(item.size))}</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center px-6 text-center">
              <div>
                <Folder className="mx-auto size-8 text-muted-foreground/60" />
                <p className="mt-3 text-sm font-semibold">{query ? "No matching items" : "This folder is empty"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {query ? "Try a different filter." : "You can still choose it as the destination."}
                </p>
              </div>
            </div>
          )}

          {nextPageToken && !query && !error ? (
            <div className="flex justify-center pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void loadFolder(currentFolder.id, nextPageToken, true)}
              >
                {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                {loading ? "Loading..." : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/20 px-5 py-4">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            Destination: <span className="font-semibold text-foreground">{currentFolder.name}</span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="button" disabled={loading || creatingFolder || Boolean(error)} onClick={() => onSelect(currentFolder)}>
              <FolderCheck className="size-4" /> Choose this folder
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function toMessage(error: unknown) {
  return typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "An unexpected Google Drive error occurred.";
}
