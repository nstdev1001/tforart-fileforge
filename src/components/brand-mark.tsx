import appIcon from "@/assets/tforart-fileforge-icon.svg";
import fileForgeLogo from "@/assets/tforart-fileforge-logo.svg";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div
        aria-label="Tforart FileForge"
        className="grid size-9 shrink-0 place-items-center rounded-xl overflow-hidden shadow-sm"
        role="img"
      >
        <img
          alt="Tforart FileForge"
          className="size-9 object-contain"
          src={appIcon}
        />
      </div>
    );
  }

  return (
    <div className="flex h-9 items-center gap-2.5">
      <img
        alt="Tforart FileForge Icon"
        className="size-8 shrink-0 rounded-lg object-contain shadow-xs"
        src={appIcon}
      />
      <img
        alt="Tforart FileForge"
        className="block w-full max-w-36 dark:invert"
        src={fileForgeLogo}
      />
    </div>
  );
}
