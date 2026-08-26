import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Download, FolderOpen, LoaderCircle, ShieldCheck, Wrench, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SevenZipSetupDialog } from "@/components/settings/seven-zip-setup-dialog";
import { isMissingSevenZipError, toErrorMessage, unavailableSevenZipStatus } from "@/lib/seven-zip";
import { getSevenZipStatus, pickFolder, startDownloadExtract, type SevenZipStatus } from "@/lib/tauri";
import { useAppStore } from "@/store/app-store";

const formSchema = z.object({
  driveLinkOrId: z.string().min(10, "Enter a Google Drive ZIP link or file ID."),
  destinationPath: z.string().min(1, "Choose an extraction destination."),
  createSubfolder: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function NewDownloadExtractForm({ onClose }: { onClose: () => void }) {
  const upsertTask = useAppStore((state) => state.upsertTask);
  const [sevenZip, setSevenZip] = useState<SevenZipStatus | null>(null);
  const [sevenZipDialogOpen, setSevenZipDialogOpen] = useState(false);
  const [sevenZipIssue, setSevenZipIssue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { driveLinkOrId: "", destinationPath: "", createSubfolder: true },
  });
  const destinationPath = watch("destinationPath");

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

  async function chooseDestination() {
    const folder = await pickFolder();
    if (folder) setValue("destinationPath", folder, { shouldValidate: true });
  }

  async function submit(values: FormValues) {
    setError(null);
    try {
      const task = await startDownloadExtract(values);
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

  return (
    <Card className="border-sky-500/20 shadow-md">
      <CardHeader className="flex-row items-start justify-between border-b border-border/70">
        <div>
          <CardTitle className="flex items-center gap-2"><Download className="size-4 text-sky-600" /> Download ZIP & extract</CardTitle>
          <CardDescription>Validate a Drive link, download its ZIP safely, extract it, and open the result.</CardDescription>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Close form"><X className="size-4" /></Button>
      </CardHeader>
      <CardContent className="pt-5">
        <form className="grid gap-4" onSubmit={handleSubmit(submit)}>
          <label className="space-y-2 text-xs font-semibold">
            Google Drive ZIP link or file ID
            <Input placeholder="https://drive.google.com/file/d/.../view" {...register("driveLinkOrId")} />
            {errors.driveLinkOrId ? <span className="block font-normal text-red-600">{errors.driveLinkOrId.message}</span> : null}
          </label>
          <label className="space-y-2 text-xs font-semibold">
            Extraction destination
            <div className="flex gap-2">
              <Input readOnly value={destinationPath} placeholder="Choose a local destination folder" className="flex-1" />
              <Button type="button" variant="outline" onClick={chooseDestination}><FolderOpen className="size-4" /> Browse</Button>
            </div>
            {errors.destinationPath ? <span className="block font-normal text-red-600">{errors.destinationPath.message}</span> : null}
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/45 px-3.5 py-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /> Unsafe archive paths are rejected before extraction.</span>
            <label className="flex items-center gap-2 font-medium text-foreground"><input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("createSubfolder")} /> Create a new subfolder</label>
            <span className="flex items-center gap-2">
              <Archive className="size-4" />
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
            <Button type="submit" disabled={isSubmitting || sevenZip?.available !== true}>
              {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
              {isSubmitting ? "Validating..." : "Download & extract"}
            </Button>
          </div>
        </form>
      </CardContent>
      <SevenZipSetupDialog
        open={sevenZipDialogOpen}
        currentPath={sevenZip?.path}
        issue={sevenZipIssue}
        onClose={() => setSevenZipDialogOpen(false)}
        onReady={handleSevenZipReady}
      />
    </Card>
  );
}
