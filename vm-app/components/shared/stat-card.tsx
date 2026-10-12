import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  note?: ReactNode;
  noteClassName?: string;
  valueClassName?: string;
  /** "lg" renders the roomier console variant (p-5, text-3xl value). */
  size?: "default" | "lg";
  /** Extra detail rows rendered below the note/value. */
  children?: ReactNode;
  className?: string;
}

/** KPI / metric card with an optional colored icon in the header row. */
export function StatCard({
  label,
  value,
  icon: Icon,
  iconClassName,
  note,
  noteClassName,
  valueClassName,
  size = "default",
  children,
  className,
}: StatCardProps) {
  const dense = size === "default";
  return (
    <Card className={cn("shadow-xs", className)}>
      <CardContent className={dense ? "p-4" : "p-5"}>
        <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
          <span>{label}</span>
          {Icon && <Icon className={cn("w-4 h-4 shrink-0", iconClassName ?? "text-primary")} />}
        </div>
        <div
          className={cn(
            "mt-2 font-bold text-foreground",
            dense ? "text-2xl" : "text-3xl tracking-tight",
            valueClassName
          )}
        >
          {value}
        </div>
        {note && (
          <div className={cn("mt-1 text-muted-foreground", dense ? "text-[11px]" : "text-xs", noteClassName)}>
            {note}
          </div>
        )}
        {children && <div className="mt-1 text-xs text-muted-foreground space-y-1">{children}</div>}
      </CardContent>
    </Card>
  );
}
