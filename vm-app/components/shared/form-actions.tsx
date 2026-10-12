import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FormActionsProps {
  submitLabel: string;
  onCancel?: () => void;
  cancelLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  /** Extra buttons rendered between cancel and submit. */
  children?: ReactNode;
  className?: string;
}

/** Right-aligned cancel/submit footer separated by a top divider. */
export function FormActions({
  submitLabel,
  onCancel,
  cancelLabel = "Cancel",
  loading,
  disabled,
  children,
  className,
}: FormActionsProps) {
  return (
    <div className={cn("flex items-center justify-end gap-2 pt-4 border-t border-border", className)}>
      {onCancel && (
        <Button type="button" variant="outline" size="sm" onClick={onCancel} className="h-9 px-4 text-xs">
          {cancelLabel}
        </Button>
      )}
      {children}
      <Button type="submit" size="sm" disabled={loading || disabled} className="h-9 px-4 text-xs gap-1.5">
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        <span>{submitLabel}</span>
      </Button>
    </div>
  );
}
