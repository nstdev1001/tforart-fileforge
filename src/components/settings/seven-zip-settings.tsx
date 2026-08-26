import { Archive, CheckCircle2, LoaderCircle, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

import { SevenZipSetupDialog } from "@/components/settings/seven-zip-setup-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toErrorMessage, unavailableSevenZipStatus } from "@/lib/seven-zip";
import { getSevenZipStatus, type SevenZipStatus } from "@/lib/tauri";

export function SevenZipSettings() {
  const [status, setStatus] = useState<SevenZipStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkIssue, setCheckIssue] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    let disposed = false;
    getSevenZipStatus()
      .then((result) => {
        if (disposed) return;
        setStatus(result);
        if (!result.available) setDialogOpen(true);
      })
      .catch((error) => {
        if (disposed) return;
        setStatus(unavailableSevenZipStatus);
        setCheckIssue(toErrorMessage(error));
        setDialogOpen(true);
      });
    return () => {
      disposed = true;
    };
  }, []);

  function handleReady(result: SevenZipStatus) {
    setStatus(result);
    setCheckIssue(null);
    setConfigured(true);
  }

  const isChecking = status === null;
  const isReady = status?.available === true;

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 border-b border-border/70">
          <div className="flex items-start gap-3">
            <Archive className="mt-0.5 size-5 text-primary" />
            <div>
              <CardTitle>7-Zip engine</CardTitle>
              <CardDescription>Automatically detected or manually configured 7z.exe.</CardDescription>
            </div>
          </div>
          <Badge variant={isReady ? "success" : "neutral"}>
            {isChecking ? <LoaderCircle className="mr-1 size-3 animate-spin" /> : null}
            {isReady ? <CheckCircle2 className="mr-1 size-3" /> : null}
            {isChecking ? "Checking" : isReady ? "Ready" : "Not detected"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium">
                {isChecking
                  ? "Scanning standard install locations and PATH..."
                  : isReady
                    ? status.version ?? "7-Zip executable detected"
                    : "7-Zip is required for compression and extraction."}
              </p>
              <p className="mt-1 break-all text-[11px] text-muted-foreground">
                {status?.path ?? "Install 7-Zip or provide the full path to 7z.exe."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(true)}
              disabled={isChecking}
            >
              <Wrench className="size-4" />
              {isReady ? "Change path" : "Set up 7-Zip"}
            </Button>
          </div>
          {configured ? (
            <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">
              7-Zip is ready and its path has been saved.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <SevenZipSetupDialog
        open={dialogOpen}
        currentPath={status?.path}
        issue={checkIssue}
        onClose={() => setDialogOpen(false)}
        onReady={handleReady}
      />
    </>
  );
}
