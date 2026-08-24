import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        neutral: "border-border bg-muted text-muted-foreground",
        success: "border-emerald-500/15 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        warning: "border-amber-500/15 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        danger: "border-red-500/15 bg-red-500/10 text-red-700 dark:text-red-300",
        info: "border-sky-500/15 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

