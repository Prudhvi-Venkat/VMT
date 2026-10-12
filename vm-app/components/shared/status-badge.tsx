import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { severityColors, findingStatusColors, toLabel, toSeverityLabel } from "@/lib/severity";

interface SeverityBadgeProps {
  value?: string | null;
  className?: string;
}

/** Colored severity pill (Critical / High / Medium / Low / Info). */
export function SeverityBadge({ value, className }: SeverityBadgeProps) {
  const label = toSeverityLabel(value);
  return (
    <Badge variant="outline" className={cn(severityColors[label.toLowerCase()] ?? severityColors.info, className)}>
      {label}
    </Badge>
  );
}

interface FindingStatusBadgeProps {
  status?: string | null;
  /** Override the rendered text (defaults to a title-cased status). */
  label?: ReactNode;
  className?: string;
}

/** Colored finding-status pill (Open / In Progress / Remediated / ...). */
export function FindingStatusBadge({ status, label, className }: FindingStatusBadgeProps) {
  const key = (status ?? "").toLowerCase();
  return (
    <Badge
      variant="outline"
      className={cn(
        findingStatusColors[key] ?? "text-muted-foreground bg-muted/40 border-border",
        className
      )}
    >
      {label ?? toLabel(key)}
    </Badge>
  );
}
