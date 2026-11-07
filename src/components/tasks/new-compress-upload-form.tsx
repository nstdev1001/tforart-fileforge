import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Archive, Cloud, FolderOpen, HardDrive, LoaderCircle, ShieldCheck, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DriveFolderPicker, type DriveFolderSelection } from "@/components/google/drive-folder-picker";
import { SevenZipSetupDialog } from "@/components/settings/seven-zip-setup-dialog";
import { PanelArrow, PanelFlow, PanelTitle } from "@/components/tasks/form-panel";
import { Button } from "@/components/ui/button";
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
      <form className="space-y-4" onSubmit={handleSubmit(submit)}>
        <PanelFlow>
          <section className="space-y-4 bg-card p-5">
            <PanelTitle step="1" icon={<HardDrive className="size-4" />} title="Local" hint="Choose what to compress on this computer." />
            <div className="space-y-2 text-xs font-semibold">
              <label htmlFor="upload-source">Source folder</label>
              <div className="flex gap-2">
                <Input id="upload-source" readOnly value={sourcePath} placeholder="Choose a local folder" className="min-w-0 flex-1" />
                <Button type="button" variant="outline" onClick={chooseFolder}><FolderOpen className="size-4" /> Browse</Button>
              </div>
              {errors.sourcePath ? <span className="block font-normal text-red-600">{errors.sourcePath.message}</span> : null}
            </div>
            <label className="block space-y-2 text-xs font-semibold">
              ZIP filename
              <Input placeholder="project-export.zip" {...register("archiveName")} />
            </label>
            <div className="flex flex-wrap items-center gap-2 bg-muted/60 px-3 py-2.5 text-[11px] text-muted-foreground">
              <Archive className="size-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">
                {sevenZip === null
                  ? "Checking 7-Zip..."
                  : sevenZip.available
                    ? sevenZip.version ?? sevenZip.path ?? "7-Zip ready"
                    : "7-Zip is not configured"}
              </span>
              {sevenZip !== null && !sevenZip.available ? (
                <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setSevenZipDialogOpen(true)}>
                  <Wrench className="size-3" /> Set up
                </Button>
              ) : null}
            </div>
          </section>

          <PanelArrow icon={<ArrowRight className="size-6" />} />

          <section className="space-y-4 bg-card p-5">
            <PanelTitle step="2" icon={<Cloud className="size-4" />} title="Google Drive" hint="Choose where the ZIP will be uploaded." />
            <div className="space-y-2 text-xs font-semibold">
              <label htmlFor="upload-drive-destination">Google Drive destination</label>
              <div className="flex gap-2">
                <Input id="upload-drive-destination" readOnly value={driveFolderName} className="min-w-0 flex-1" />
                <Button type="button" variant="outline" onClick={() => setShowDrivePicker(true)}>
                  <FolderOpen className="size-4" /> Browse Drive
                </Button>
              </div>
              <input type="hidden" {...register("driveFolderId")} />
            </div>
            <label className="flex h-10 items-center gap-2 border border-border bg-background/60 px-3 text-xs font-medium">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("makePublic")} />
              Anyone with link can view
            </label>
            <p className="flex items-center gap-2 bg-muted/60 px-3 py-2.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0 text-primary" /> Temporary ZIP is deleted after a successful upload.
            </p>
          </section>
        </PanelFlow>

        {error ? <p role="alert" className="bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting || !sevenZip?.available}>
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <Archive className="size-4" />}
            {isSubmitting ? "Starting..." : "Compress & upload"}
          </Button>
        </div>
      </form>
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
