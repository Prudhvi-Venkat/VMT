import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned action (usually a button). */
  action?: ReactNode;
  className?: string;
}

/** Section title + optional description with an optional right-aligned action. */
export function SectionHeader({ title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {action && (
        <div className="flex flex-wrap shrink-0 items-center gap-2">{action}</div>
      )}
    </div>
  );
}
