import { Archive, CheckCircle2, LoaderCircle, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSevenZipStatus, setSevenZipPath, type SevenZipStatus } from "@/lib/tauri";

export function SevenZipSettings() {
  const [status, setStatus] = useState<SevenZipStatus | null>(null);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getSevenZipStatus()
      .then((result) => { setStatus(result); setPath(result.path ?? ""); })
      .catch((error) => setMessage(String(error)));
  }, []);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await setSevenZipPath(path);
      setStatus(result);
      setPath(result.path ?? path);
      setMessage("7-Zip executable verified and saved to SQLite settings.");
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 border-b border-border/70">
        <div className="flex items-start gap-3"><Archive className="mt-0.5 size-5 text-primary" /><div><CardTitle>7-Zip engine</CardTitle><CardDescription>Automatically detected or manually configured 7z.exe.</CardDescription></div></div>
        <Badge variant={status?.available ? "success" : "neutral"}>{status?.available ? <CheckCircle2 className="mr-1 size-3" /> : null}{status?.available ? "Ready" : "Not detected"}</Badge>
      </CardHeader>
      <CardContent className="space-y-3 pt-5">
        <div className="flex gap-2"><Input value={path} onChange={(event) => setPath(event.target.value)} placeholder="C:\Program Files\7-Zip\7z.exe" /><Button type="button" variant="outline" onClick={save} disabled={busy || !path.trim()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Save</Button></div>
        <p className="text-[11px] text-muted-foreground">{status?.version ?? "FileForge scans standard Program Files locations and PATH."}</p>
        {message ? <p className="rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}

