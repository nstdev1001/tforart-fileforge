import { zodResolver } from "@hookform/resolvers/zod";
import { Check, FolderCog, Palette, Save, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { type Theme, useAppStore } from "@/store/app-store";

const settingsSchema = z.object({
  concurrentUploads: z.number().int().min(1).max(10),
  temporaryDirectory: z.string().max(500),
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
  const { register, handleSubmit, formState: { errors } } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { concurrentUploads: 3, temporaryDirectory: "" },
  });

  function saveSettings() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <form className="mx-auto max-w-4xl space-y-5" onSubmit={handleSubmit(saveSettings)}>
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
          <div><CardTitle>Task engine</CardTitle><CardDescription>Defaults are persisted to SQLite in the worker-pool phase.</CardDescription></div>
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

      <div className="flex justify-end">
        <Button type="submit">{saved ? <Check className="size-4" /> : <Save className="size-4" />}{saved ? "Saved" : "Save changes"}</Button>
      </div>
    </form>
  );
}
