import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Badges rendered on their own row above the title. */
  badges?: ReactNode;
  title: ReactNode;
  /** Badges rendered inline right after the title. */
  titleBadges?: ReactNode;
  description?: ReactNode;
  descriptionClassName?: string;
  /** Right-aligned action buttons; omit to hide the slot entirely. */
  actions?: ReactNode;
  className?: string;
}

/** Page banner: badges / title / description on the left, actions on the right, with a bottom divider. */
export function PageHeader({
  badges,
  title,
  titleBadges,
  description,
  descriptionClassName,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border",
        className
      )}
    >
      <div className="min-w-0">
        {badges && <div className="flex items-center gap-2">{badges}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <h1
            className={cn(
              "text-xl font-bold tracking-tight text-foreground",
              badges && "mt-1"
            )}
          >
            {title}
          </h1>
          {titleBadges}
        </div>
        {description && (
          <div className={cn("text-xs text-muted-foreground", descriptionClassName)}>{description}</div>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
