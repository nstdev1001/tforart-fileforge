import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Folder, FolderOpen, LoaderCircle, ShieldCheck, Wrench, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DriveFolderPicker, type DriveFolderSelection } from "@/components/google/drive-folder-picker";
import { SevenZipSetupDialog } from "@/components/settings/seven-zip-setup-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { isMissingSevenZipError, toErrorMessage, unavailableSevenZipStatus } from "@/lib/seven-zip";
import {
  getSevenZipStatus,
  pickFolder,
  startCompressUpload,
  type SevenZipStatus,
} from "@/lib/tauri";
import { useAppStore } from "@/store/app-store";

const formSchema = z.object({
  sourcePath: z.string().min(1, "Choose a source folder."),
  archiveName: z.string().max(180),
  driveFolderId: z.string().min(1),
  makePublic: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function NewCompressUploadForm({ onClose }: { onClose: () => void }) {
  const upsertTask = useAppStore((state) => state.upsertTask);
  const [sevenZip, setSevenZip] = useState<SevenZipStatus | null>(null);
  const [sevenZipDialogOpen, setSevenZipDialogOpen] = useState(false);
  const [sevenZipIssue, setSevenZipIssue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveFolderName, setDriveFolderName] = useState("My Drive");
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { sourcePath: "", archiveName: "", driveFolderId: "root", makePublic: true },
  });
  const sourcePath = watch("sourcePath");

  useEffect(() => {
    let disposed = false;
    getSevenZipStatus()
      .then((status) => {
        if (disposed) return;
        setSevenZip(status);
        if (!status.available) setSevenZipDialogOpen(true);
      })
      .catch((reason) => {
        if (disposed) return;
        setSevenZip(unavailableSevenZipStatus);
        setSevenZipIssue(toErrorMessage(reason));
        setSevenZipDialogOpen(true);
      });
    return () => {
      disposed = true;
    };
  }, []);

  async function chooseFolder() {
    const folder = await pickFolder();
    if (!folder) return;
    setValue("sourcePath", folder, { shouldValidate: true });
    const name = folder.split(/[\\/]/).filter(Boolean).at(-1) ?? "archive";
    setValue("archiveName", `${name}.zip`);
  }

  async function submit(values: FormValues) {
    setError(null);
    try {
      const task = await startCompressUpload({
        sourcePath: values.sourcePath,
        archiveName: values.archiveName || undefined,
        driveFolderId: values.driveFolderId,
        makePublic: values.makePublic,
      });
      upsertTask(task);
      onClose();
    } catch (reason) {
      if (isMissingSevenZipError(reason)) {
        setSevenZip(unavailableSevenZipStatus);
        setSevenZipIssue(null);
        setSevenZipDialogOpen(true);
      } else {
        setError(toErrorMessage(reason));
      }
    }
  }

  function handleSevenZipReady(status: SevenZipStatus) {
    setSevenZip(status);
    setSevenZipIssue(null);
    setError(null);
  }

  function chooseDriveFolder(folder: DriveFolderSelection) {
    setValue("driveFolderId", folder.id, { shouldDirty: true, shouldValidate: true });
    setDriveFolderName(folder.name);
    setShowDrivePicker(false);
  }

  return (
    <>
      <Card className="border-primary/20 shadow-md">
      <CardHeader className="flex-row items-start justify-between border-b border-border/70">
        <div>
          <CardTitle className="flex items-center gap-2"><Archive className="size-4 text-primary" /> Compress folder & upload ZIP</CardTitle>
          <CardDescription>Tforart FileForge checks disk space, creates a temporary ZIP, and uploads it in resumable chunks.</CardDescription>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Close form"><X className="size-4" /></Button>
      </CardHeader>
      <CardContent className="pt-5">
        <form className="grid gap-4" onSubmit={handleSubmit(submit)}>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <label className="space-y-2 text-xs font-semibold">
              Source folder
              <div className="flex gap-2">
                <Input readOnly value={sourcePath} placeholder="Choose a local folder" className="flex-1" />
                <Button type="button" variant="outline" onClick={chooseFolder}><FolderOpen className="size-4" /> Browse</Button>
              </div>
              {errors.sourcePath ? <span className="block font-normal text-red-600">{errors.sourcePath.message}</span> : null}
            </label>
            <label className="space-y-2 text-xs font-semibold">
              ZIP filename
              <Input placeholder="project-export.zip" {...register("archiveName")} />
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-2 text-xs font-semibold">
              <label htmlFor="upload-drive-destination">Google Drive destination</label>
              <div className="flex gap-2">
                <Input id="upload-drive-destination" readOnly value={driveFolderName} />
                <Button type="button" variant="outline" onClick={() => setShowDrivePicker(true)}>
                  <FolderOpen className="size-4" /> Browse Drive
                </Button>
              </div>
              <input type="hidden" {...register("driveFolderId")} />
            </div>
            <label className="flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("makePublic")} />
              Anyone with link can view
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/45 px-3.5 py-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Temporary ZIP is deleted after a successful upload.</span>
            <span className="flex items-center gap-2">
              <Folder className="size-4" />
              {sevenZip === null
                ? "Checking 7-Zip..."
                : sevenZip.available
                  ? sevenZip.version ?? sevenZip.path ?? "7-Zip ready"
                  : "7-Zip is not configured"}
              {sevenZip !== null && !sevenZip.available ? (
                <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setSevenZipDialogOpen(true)}>
                  <Wrench className="size-3" /> Set up
                </Button>
              ) : null}
            </span>
          </div>
          {error ? <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !sevenZip?.available}>
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <Archive className="size-4" />}
              {isSubmitting ? "Starting..." : "Compress & upload"}
            </Button>
          </div>
        </form>
      </CardContent>
      </Card>
      <DriveFolderPicker
        open={showDrivePicker}
        onClose={() => setShowDrivePicker(false)}
        onSelect={chooseDriveFolder}
      />
      <SevenZipSetupDialog
        open={sevenZipDialogOpen}
        currentPath={sevenZip?.path}
        issue={sevenZipIssue}
        onClose={() => setSevenZipDialogOpen(false)}
        onReady={handleSevenZipReady}
      />
    </>
  );
}
