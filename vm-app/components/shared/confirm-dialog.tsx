import type { ReactNode } from "react";
import { AlertTriangle, Loader2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive confirms get a red confirm button and warning icon. */
  destructive?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  onConfirm: () => void;
}

/** Shared confirmation modal replacing inline `confirm()` calls. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  loading,
  icon: Icon,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                destructive
                  ? "bg-red-500/10 text-red-600 dark:text-red-400"
                  : "bg-primary/10 text-primary"
              )}
            >
              {Icon ? <Icon className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            </span>
            <div className="space-y-1.5">
              <DialogTitle className="text-base">{title}</DialogTitle>
              {description && <DialogDescription className="text-xs">{description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="h-9 px-4 text-xs"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
            className="h-9 px-4 text-xs gap-1.5"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmLabel}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
