import { zodResolver } from "@hookform/resolvers/zod";
import { Bell, Check, FolderCog, Gauge, PanelTopClose, Palette, Power, Save, Send, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { GoogleDriveSettings } from "@/components/google/google-drive-settings";
import { SevenZipSettings } from "@/components/settings/seven-zip-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getDesktopPreferences,
  getBandwidthPreferences,
  getWorkerPoolConfig,
  sendTestNotification,
  setDesktopPreferences,
  setBandwidthPreferences,
  setWorkerPoolConfig,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { type Theme, useAppStore } from "@/store/app-store";

const settingsSchema = z.object({
  concurrentUploads: z.number().int().min(1).max(10),
  temporaryDirectory: z.string().max(500),
  autoStart: z.boolean(),
  closeToTray: z.boolean(),
  notificationsEnabled: z.boolean(),
  maximumBandwidth: z.boolean(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

const themes: Array<{ value: Theme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function SettingsPage() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [defaultBandwidth, setDefaultBandwidth] = useState({ upload: 10, download: 25 });
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      concurrentUploads: 3,
      temporaryDirectory: "",
      autoStart: false,
      closeToTray: true,
      notificationsEnabled: true,
      maximumBandwidth: false,
    },
  });

  useEffect(() => {
    getWorkerPoolConfig()
      .then((config) => setValue("concurrentUploads", config.concurrentTasks))
      .catch(() => {
        // Browser preview has no native worker pool.
      });
    getDesktopPreferences()
      .then((preferences) => {
        setValue("autoStart", preferences.autoStart);
        setValue("closeToTray", preferences.closeToTray);
        setValue("notificationsEnabled", preferences.notificationsEnabled);
      })
      .catch(() => {
        // Browser preview has no desktop integration plugins.
      });
    getBandwidthPreferences()
      .then((preferences) => {
        setValue("maximumBandwidth", preferences.maximumBandwidth);
        setDefaultBandwidth({
          upload: preferences.defaultUploadMbps,
          download: preferences.defaultDownloadMbps,
        });
      })
      .catch(() => {
        // Browser preview has no native bandwidth manager.
      });
  }, [setValue]);

  const maximumBandwidth = watch("maximumBandwidth");

  async function saveSettings(values: SettingsForm) {
    setSaveError(null);
    try {
      await setWorkerPoolConfig(values.concurrentUploads);
      await setDesktopPreferences({
        autoStart: values.autoStart,
        closeToTray: values.closeToTray,
        notificationsEnabled: values.notificationsEnabled,
      });
      await setBandwidthPreferences(values.maximumBandwidth);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <form className="mx-auto max-w-4xl space-y-5" onSubmit={handleSubmit(saveSettings)}>
      <GoogleDriveSettings />
      <SevenZipSettings />

      <Card>
        <CardHeader className="flex-row items-start gap-3 border-b border-border/70">
          <Palette className="mt-0.5 size-5 text-primary" />
          <div><CardTitle>Appearance</CardTitle><CardDescription>Choose how Tforart FileForge looks on this device.</CardDescription></div>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 pt-5">
          {themes.map((item) => (
            <button type="button" key={item.value} onClick={() => setTheme(item.value)} className={cn("relative rounded-xl border p-4 text-left text-sm font-medium transition-colors hover:bg-accent", theme === item.value && "border-primary bg-primary/[0.06]")}>
              {item.label}
              {theme === item.value ? <Check className="absolute right-3 top-3 size-4 text-primary" /> : null}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start gap-3 border-b border-border/70">
          <SlidersHorizontal className="mt-0.5 size-5 text-primary" />
          <div><CardTitle>Task engine</CardTitle><CardDescription>The worker limit is applied immediately and persisted in SQLite.</CardDescription></div>
        </CardHeader>
        <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
          <label className="space-y-2 text-xs font-semibold">
            Concurrent uploads
            <Input type="number" min={1} max={10} {...register("concurrentUploads", { valueAsNumber: true })} />
            {errors.concurrentUploads ? <span className="block font-normal text-red-600">Choose a value from 1 to 10.</span> : null}
          </label>
          <label className="space-y-2 text-xs font-semibold">
            <span className="flex items-center gap-1.5"><FolderCog className="size-3.5" /> Temporary directory</span>
            <Input placeholder="Use system default" {...register("temporaryDirectory")} />
          </label>
          <div className="flex items-center gap-4 rounded-xl border border-border/70 p-4 sm:col-span-2">
            <Gauge className="size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">Maximum bandwidth</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {maximumBandwidth
                  ? "No Tforart FileForge speed limit. Uploads and downloads can use all available bandwidth."
                  : `Default mode shares ${defaultBandwidth.upload} Mbps upload and ${defaultBandwidth.download} Mbps download across active tasks.`}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={maximumBandwidth}
              aria-label="Use maximum bandwidth"
              onClick={() => setValue("maximumBandwidth", !maximumBandwidth, { shouldDirty: true })}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
                maximumBandwidth ? "border-primary bg-primary" : "border-border bg-muted",
              )}
            >
              <span
                className={cn(
                  "absolute left-0.5 top-0.5 size-4.5 rounded-full bg-white shadow-sm transition-transform",
                  maximumBandwidth ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start gap-3 border-b border-border/70">
          <Power className="mt-0.5 size-5 text-primary" />
          <div><CardTitle>Desktop experience</CardTitle><CardDescription>Control startup, background behavior, and Windows notifications.</CardDescription></div>
        </CardHeader>
        <CardContent className="space-y-3 pt-5">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 p-4 hover:bg-accent/60">
            <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" {...register("autoStart")} />
            <Power className="size-4 text-primary" />
            <span className="flex-1"><span className="block text-xs font-semibold">Start with Windows</span><span className="mt-0.5 block text-[11px] text-muted-foreground">Launch Tforart FileForge hidden in the system tray after sign-in.</span></span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 p-4 hover:bg-accent/60">
            <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" {...register("closeToTray")} />
            <PanelTopClose className="size-4 text-primary" />
            <span className="flex-1"><span className="block text-xs font-semibold">Keep running after window closes</span><span className="mt-0.5 block text-[11px] text-muted-foreground">The close button hides Tforart FileForge; use Quit from the tray to stop background tasks.</span></span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 p-4 hover:bg-accent/60">
            <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" {...register("notificationsEnabled")} />
            <Bell className="size-4 text-primary" />
            <span className="flex-1"><span className="block text-xs font-semibold">Native task notifications</span><span className="mt-0.5 block text-[11px] text-muted-foreground">Notify when a task or watcher completes or fails.</span></span>
            <Button type="button" variant="outline" size="sm" onClick={(event) => { event.preventDefault(); event.stopPropagation(); sendTestNotification().catch((error) => setSaveError(String(error))); }}><Send className="size-3" /> Test</Button>
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        {saveError ? <p className="mr-auto self-center text-xs text-red-600">{saveError}</p> : null}
        <Button type="submit" disabled={isSubmitting}>{saved ? <Check className="size-4" /> : <Save className="size-4" />}{isSubmitting ? "Saving..." : saved ? "Saved" : "Save changes"}</Button>
      </div>
    </form>
  );
}
