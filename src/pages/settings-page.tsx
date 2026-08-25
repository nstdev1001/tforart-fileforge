import { zodResolver } from "@hookform/resolvers/zod";
import { Bell, Check, FolderCog, PanelTopClose, Palette, Power, Save, Send, SlidersHorizontal } from "lucide-react";
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
  getWorkerPoolConfig,
  sendTestNotification,
  setDesktopPreferences,
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
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      concurrentUploads: 3,
      temporaryDirectory: "",
      autoStart: false,
      closeToTray: true,
      notificationsEnabled: true,
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
  }, [setValue]);

  async function saveSettings(values: SettingsForm) {
    setSaveError(null);
    try {
      await setWorkerPoolConfig(values.concurrentUploads);
      await setDesktopPreferences({
        autoStart: values.autoStart,
        closeToTray: values.closeToTray,
        notificationsEnabled: values.notificationsEnabled,
      });
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
          <div><CardTitle>Appearance</CardTitle><CardDescription>Choose how FileForge looks on this device.</CardDescription></div>
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
            <span className="flex-1"><span className="block text-xs font-semibold">Start with Windows</span><span className="mt-0.5 block text-[11px] text-muted-foreground">Launch FileForge hidden in the system tray after sign-in.</span></span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 p-4 hover:bg-accent/60">
            <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" {...register("closeToTray")} />
            <PanelTopClose className="size-4 text-primary" />
            <span className="flex-1"><span className="block text-xs font-semibold">Keep running after window closes</span><span className="mt-0.5 block text-[11px] text-muted-foreground">The close button hides FileForge; use Quit from the tray to stop background tasks.</span></span>
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
