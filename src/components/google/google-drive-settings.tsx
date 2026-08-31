import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  ExternalLink,
  File,
  Folder,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  getGoogleAuthStatus,
  listGoogleDriveFolder,
  testGoogleDriveConnection,
} from "@/lib/tauri";
import { formatBytes } from "@/lib/utils";
import type { DriveConnection, DriveFile, GoogleAuthStatus } from "@/types/drive";

const FOLDER_MIME = "application/vnd.google-apps.folder";

export function GoogleDriveSettings() {
  const [status, setStatus] = useState<GoogleAuthStatus | null>(null);
  const [connection, setConnection] = useState<DriveConnection | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [busy, setBusy] = useState<"connect" | "test" | "list" | "disconnect" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus() {
    try {
      const nextStatus = await getGoogleAuthStatus();
      setStatus(nextStatus);
      if (nextStatus.authenticated) {
        await testConnection();
      }
    } catch {
      setMessage("Google Drive integration is available in the Tauri desktop runtime.");
    }
  }

  async function connect() {
    setBusy("connect");
    setMessage("Complete sign-in in the browser. Tforart FileForge will continue automatically.");
    try {
      await connectGoogleDrive();
      setStatus(await getGoogleAuthStatus());
      await testConnection();
      setMessage("Google Drive connected. Tokens are stored in Windows Credential Manager.");
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setBusy((current) => current ?? "test");
    try {
      setConnection(await testGoogleDriveConnection());
      setMessage(null);
    } catch (error) {
      setConnection(null);
      setMessage(toErrorMessage(error));
    } finally {
      setBusy((current) => (current === "test" ? null : current));
    }
  }

  async function listRoot() {
    setBusy("list");
    setMessage(null);
    try {
      const page = await listGoogleDriveFolder();
      setFiles(page.files);
      setMessage(`Loaded ${page.files.length} item${page.files.length === 1 ? "" : "s"} from My Drive.`);
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      await disconnectGoogleDrive();
      setStatus((current) => current ? { ...current, authenticated: false } : current);
      setConnection(null);
      setFiles([]);
      setMessage("Google OAuth tokens were removed from Windows Credential Manager.");
    } catch (error) {
      setMessage(toErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const connected = status?.authenticated === true;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 border-b border-border/70">
        <div className="flex items-start gap-3">
          <Cloud className="mt-0.5 size-5 text-primary" />
          <div>
            <CardTitle>Google Drive</CardTitle>
            <CardDescription>OAuth2 desktop connection and secure token storage.</CardDescription>
          </div>
        </div>
        <Badge variant={connected ? "success" : "neutral"}>
          {connected ? <CheckCircle2 className="mr-1 size-3" /> : <CloudOff className="mr-1 size-3" />}
          {connected ? "Connected" : "Not connected"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-muted/25 p-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="size-4 text-primary" /> Credential security</div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {status?.secureStorageAvailable
                ? "Windows Credential Manager is available. Access and refresh tokens never enter the webview."
                : "Secure storage status is unavailable until the native app starts."}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/25 p-3.5">
            <p className="text-xs font-semibold">OAuth configuration</p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {status?.configured
                ? "Desktop client credentials were loaded from the native environment."
                : "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in .env."}
            </p>
          </div>
        </div>

        {connection ? (
          <div className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/[0.05] p-3.5">
            {connection.user.photoLink ? <img src={connection.user.photoLink} alt="" className="size-9 rounded-full" referrerPolicy="no-referrer" /> : <div className="grid size-9 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">G</div>}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{connection.user.displayName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{connection.user.emailAddress}</p>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              <p>{formatBytes(Number(connection.storageQuota.usage))} used</p>
              {connection.storageQuota.limit ? <p>of {formatBytes(Number(connection.storageQuota.limit))}</p> : null}
            </div>
          </div>
        ) : null}

        {files.length ? (
          <div className="max-h-52 divide-y divide-border/70 overflow-y-auto rounded-xl border border-border/70">
            {files.map((item) => {
              const Icon = item.mimeType === FOLDER_MIME ? Folder : File;
              return (
                <div key={item.id} className="flex items-center gap-3 px-3.5 py-2.5 text-xs">
                  <Icon className="size-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.size ? <span className="text-[11px] text-muted-foreground">{formatBytes(Number(item.size))}</span> : null}
                  {item.webViewLink ? <ExternalLink className="size-3.5 text-muted-foreground" /> : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {message ? <p role="status" className="rounded-lg bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">{message}</p> : null}

        <div className="flex flex-wrap justify-end gap-2">
          {connected ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => void testConnection()} disabled={busy !== null}>
                {busy === "test" ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Test
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={listRoot} disabled={busy !== null}>
                {busy === "list" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Folder className="size-3.5" />} List My Drive
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={disconnect} disabled={busy !== null}>
                <LogOut className="size-3.5" /> Disconnect
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" onClick={connect} disabled={busy !== null || status?.configured === false}>
              {busy === "connect" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Cloud className="size-3.5" />}
              {busy === "connect" ? "Waiting for browser" : "Connect Google Drive"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function toErrorMessage(error: unknown): string {
  return typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "An unexpected Google Drive error occurred.";
}

