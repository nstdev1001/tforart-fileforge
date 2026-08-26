import { zodResolver } from "@hookform/resolvers/zod";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Clock3,
  Copy,
  Eye,
  FolderOpen,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  Telescope,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { mergeRecordsByUpdatedAt } from "@/lib/record-utils";
import {
  createWatcher,
  deleteWatcher,
  listGoogleDriveFolder,
  listWatchers,
  pickFolder,
  restartWatcher,
  stopWatcher,
} from "@/lib/tauri";
import { formatRelativeTime } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { DriveFile } from "@/types/drive";
import type { FolderWatcher, WatcherStatus } from "@/types/task";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const EXTENSION_GROUPS = [
  {
    label: "Images",
    extensions: ["jpg", "jpeg", "png"],
  },
  {
    label: "Videos",
    extensions: ["mp4", "mov"],
  },
] as const;
const ALL_EXTENSIONS = EXTENSION_GROUPS.flatMap((group) => [...group.extensions]);

const formSchema = z.object({
  name: z.string().max(100),
  localPath: z.string().min(1, "Choose a local folder."),
  driveFolderId: z.string().min(1, "Choose a Google Drive destination.").max(256),
  settlingDelaySeconds: z.number().int().min(1).max(10),
  extensions: z.array(z.string()).min(1, "Choose at least one extension."),
});

type WatcherForm = z.infer<typeof formSchema>;

const statusLabel: Record<WatcherStatus, string> = {
  watching: "Watching",
  draining: "Finishing queue",
  stopped: "Stopped",
  failed: "Failed",
};

const statusVariant: Record<WatcherStatus, "info" | "warning" | "neutral" | "danger"> = {
  watching: "info",
  draining: "warning",
  stopped: "neutral",
  failed: "danger",
};

export function WatchersPage() {
  const removeTask = useAppStore((state) => state.removeTask);
  const [watchers, setWatchers] = useState<FolderWatcher[]>([]);
  const [folders, setFolders] = useState<DriveFile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showExtensionPicker, setShowExtensionPicker] = useState(false);
  const extensionPickerRef = useRef<HTMLDivElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<WatcherForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      localPath: "",
      driveFolderId: "root",
      settlingDelaySeconds: 3,
      extensions: ALL_EXTENSIONS,
    },
  });
  const selectedPath = watch("localPath");
  const selectedExtensions = watch("extensions");

  useEffect(() => {
    if (!showExtensionPicker) return;

    function closePicker(event: PointerEvent) {
      if (!extensionPickerRef.current?.contains(event.target as Node)) {
        setShowExtensionPicker(false);
      }
    }

    function closePickerOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setShowExtensionPicker(false);
    }

    document.addEventListener("pointerdown", closePicker);
    document.addEventListener("keydown", closePickerOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePicker);
      document.removeEventListener("keydown", closePickerOnEscape);
    };
  }, [showExtensionPicker]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    async function subscribeAndHydrate() {
      try {
        const dispose = await listen<FolderWatcher>("watcher-progress", (event) => {
          setWatchers((current) => mergeRecordsByUpdatedAt(current, [event.payload], true));
        });
        if (disposed) {
          dispose();
          return;
        }
        unlisten = dispose;
      } catch {
        // Event listening is only available inside Tauri.
      }

      if (disposed) return;
      try {
        const records = await listWatchers();
        if (!disposed) {
          setWatchers((current) => mergeRecordsByUpdatedAt(current, records));
        }
      } catch (error) {
        if (!disposed && isTauri()) {
          const message = error instanceof Error ? error.message : String(error);
          setNativeError(`Could not load folder watchers: ${message}`);
        }
      }
    }

    void subscribeAndHydrate();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!showForm) return;

    let disposed = false;
    listGoogleDriveFolder()
      .then((page) => {
        if (!disposed) {
          setFolders(page.files.filter((file) => file.mimeType === FOLDER_MIME));
        }
      })
      .catch((error) => {
        if (!disposed) {
          setNativeError(error instanceof Error ? error.message : String(error));
        }
      });

    return () => {
      disposed = true;
    };
  }, [showForm]);

  async function chooseFolder() {
    setNativeError(null);
    try {
      const path = await pickFolder();
      if (path) setValue("localPath", path, { shouldValidate: true });
    } catch (error) {
      setNativeError(error instanceof Error ? error.message : String(error));
    }
  }

  async function submit(values: WatcherForm) {
    setNativeError(null);
    try {
      const record = await createWatcher({
        name: values.name,
        localPath: values.localPath,
        driveFolderId: values.driveFolderId.trim(),
        settlingDelayMs: values.settlingDelaySeconds * 1_000,
        includeExtensions: values.extensions,
      });
      setWatchers((current) => mergeRecordsByUpdatedAt(current, [record]));
      reset();
      setShowExtensionPicker(false);
      setShowForm(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNativeError(message);
      try {
        const records = await listWatchers();
        setWatchers((current) => mergeRecordsByUpdatedAt(current, records));
      } catch (refreshError) {
        const refreshMessage = refreshError instanceof Error
          ? refreshError.message
          : String(refreshError);
        setNativeError(`${message} Could not refresh folder watchers: ${refreshMessage}`);
      }
    }
  }

  function toggleExtension(extension: string) {
    const nextExtensions = selectedExtensions.includes(extension)
      ? selectedExtensions.filter((value) => value !== extension)
      : ALL_EXTENSIONS.filter((value) => value === extension || selectedExtensions.includes(value));
    setValue("extensions", nextExtensions, { shouldDirty: true, shouldValidate: true });
  }

  function toggleAllExtensions() {
    setValue(
      "extensions",
      selectedExtensions.length === ALL_EXTENSIONS.length ? [] : [...ALL_EXTENSIONS],
      { shouldDirty: true, shouldValidate: true },
    );
  }

  async function toggleWatcher(watcher: FolderWatcher) {
    setBusyId(watcher.id);
    setNativeError(null);
    try {
      if (watcher.enabled) await stopWatcher(watcher.id);
      else {
        const updated = await restartWatcher(watcher.id);
        setWatchers((current) => mergeRecordsByUpdatedAt(current, [updated]));
      }
    } catch (error) {
      setNativeError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(null);
    }
  }

  async function removeWatcher(watcher: FolderWatcher) {
    setBusyId(watcher.id);
    setNativeError(null);
    try {
      await deleteWatcher(watcher.id);
      setWatchers((current) => current.filter((item) => item.id !== watcher.id));
      removeTask(`watcher:${watcher.id}`);
    } catch (error) {
      setNativeError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Folder automation</p>
          <p className="mt-1 text-xs text-muted-foreground">Stable matching files enter the shared upload queue automatically.</p>
        </div>
        <Button onClick={() => {
          setShowForm((value) => !value);
          setShowExtensionPicker(false);
        }}>
          {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
          {showForm ? "Close" : "Add watcher"}
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardHeader className="border-b border-border/70">
            <CardTitle className="flex items-center gap-2"><Telescope className="size-4 text-primary" /> New folder watcher</CardTitle>
            <CardDescription>Monitoring stops after 30 seconds without a new matching file, then waits for queued uploads.</CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(submit)}>
              <label className="space-y-2 text-xs font-semibold">
                Name
                <Input placeholder="Render output" {...register("name")} />
              </label>
              <label className="space-y-2 text-xs font-semibold">
                Google Drive destination
                <select className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" {...register("driveFolderId")}>
                  <option value="root">My Drive</option>
                  {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                </select>
                {errors.driveFolderId ? <span className="block font-normal text-red-600">{errors.driveFolderId.message}</span> : null}
              </label>
              <label className="space-y-2 text-xs font-semibold sm:col-span-2">
                Local folder
                <div className="flex gap-2">
                  <Input readOnly value={selectedPath} placeholder="Choose a folder to watch" />
                  <Button type="button" variant="outline" onClick={chooseFolder}><FolderOpen className="size-4" /> Browse</Button>
                </div>
                <input type="hidden" {...register("localPath")} />
                {errors.localPath ? <span className="block font-normal text-red-600">{errors.localPath.message}</span> : null}
              </label>
              <label className="space-y-2 text-xs font-semibold">
                Stability delay (seconds)
                <Input type="number" min={1} max={10} {...register("settlingDelaySeconds", { valueAsNumber: true })} />
                {errors.settlingDelaySeconds ? <span className="block font-normal text-red-600">Choose a value from 1 to 10.</span> : null}
              </label>
              <div className="space-y-2 text-xs font-semibold" ref={extensionPickerRef}>
                <label htmlFor="included-extensions">Included extensions</label>
                <div className="relative">
                  <Input
                    id="included-extensions"
                    className="pr-11"
                    readOnly
                    value={selectedExtensions.map((extension) => `.${extension}`).join(", ")}
                    placeholder="No file types selected"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0"
                    aria-label="Edit included extensions"
                    aria-expanded={showExtensionPicker}
                    aria-controls="included-extensions-picker"
                    aria-haspopup="dialog"
                    onClick={() => setShowExtensionPicker((value) => !value)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  {showExtensionPicker ? (
                    <div
                      id="included-extensions-picker"
                      className="absolute right-0 top-12 z-20 w-full min-w-72 rounded-xl border border-border bg-card p-3 text-card-foreground shadow-xl"
                      role="dialog"
                      aria-label="Choose included extensions"
                    >
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent">
                        <input
                          className="size-4 accent-primary"
                          type="checkbox"
                          ref={(element) => {
                            if (element) {
                              element.indeterminate = selectedExtensions.length > 0
                                && selectedExtensions.length < ALL_EXTENSIONS.length;
                            }
                          }}
                          checked={selectedExtensions.length === ALL_EXTENSIONS.length}
                          onChange={toggleAllExtensions}
                        />
                        <span className="text-xs font-semibold">Select all</span>
                      </label>
                      <div className="my-2 border-t border-border/70" />
                      <div className="grid grid-cols-2 gap-x-4">
                        {EXTENSION_GROUPS.map((group) => (
                          <div key={group.label}>
                            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
                            {group.extensions.map((extension) => (
                              <label key={extension} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 font-normal hover:bg-accent">
                                <input
                                  className="size-4 accent-primary"
                                  type="checkbox"
                                  checked={selectedExtensions.includes(extension)}
                                  onChange={() => toggleExtension(extension)}
                                />
                                <span>.{extension}</span>
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex justify-end border-t border-border/70 pt-3">
                        <Button type="button" size="sm" onClick={() => setShowExtensionPicker(false)}>Done</Button>
                      </div>
                    </div>
                  ) : null}
                </div>
                {errors.extensions ? <span className="block font-normal text-red-600">{errors.extensions.message}</span> : null}
              </div>
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <Eye className="size-4" />}{isSubmitting ? "Starting..." : "Start watching"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {nativeError ? <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-700 dark:text-red-300">{nativeError}</p> : null}

      {watchers.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {watchers.map((watcher) => (
            <Card key={watcher.id} className="p-5">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Telescope className="size-[18px]" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{watcher.name}</h3>
                      <p className="mt-1 truncate text-[11px] text-muted-foreground" title={watcher.localPath}>{watcher.localPath}</p>
                    </div>
                    <Badge variant={statusVariant[watcher.status]}>{statusLabel[watcher.status]}</Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-xl bg-muted/60 p-2"><p className="text-lg font-semibold">{watcher.filesDetected}</p><p className="text-[10px] text-muted-foreground">Detected</p></div>
                    <div className="rounded-xl bg-emerald-500/10 p-2"><p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{watcher.filesUploaded ?? 0}</p><p className="text-[10px] text-muted-foreground">Uploaded</p></div>
                  </div>
                  <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
                    <p>{watcher.includeExtensions.map((value) => `.${value}`).join(", ")} · stable for {watcher.settlingDelayMs / 1_000}s</p>
                    <p className="flex items-center gap-1"><Clock3 className="size-3" /> Last activity {watcher.lastActivityAt ? formatRelativeTime(watcher.lastActivityAt) : "—"}</p>
                    {watcher.errorMessage ? <p className="text-red-600 dark:text-red-300">{watcher.errorMessage}</p> : null}
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
                    {watcher.driveWebViewLink ? (
                      <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(watcher.driveWebViewLink!)}><Copy className="size-3" /> Copy folder link</Button>
                    ) : null}
                    <Button variant="outline" size="sm" disabled={busyId === watcher.id || watcher.status === "draining"} onClick={() => toggleWatcher(watcher)}>
                      {watcher.enabled ? <Pause className="size-3" /> : <Play className="size-3" />}{watcher.enabled ? "Stop" : "Start again"}
                    </Button>
                    {!watcher.enabled ? <Button variant="ghost" size="sm" disabled={busyId === watcher.id} onClick={() => removeWatcher(watcher)}><Trash2 className="size-3" /> Delete</Button> : null}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="grid min-h-[420px] place-items-center border-dashed bg-card/60 text-center">
          <div className="max-w-sm px-6">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><UploadCloud className="size-6" /></div>
            <h2 className="mt-4 font-semibold">No folder watchers</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Create one to detect stable render files and upload them automatically.</p>
            <Button className="mt-5" onClick={() => setShowForm(true)}><Plus className="size-4" /> Add watcher</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
