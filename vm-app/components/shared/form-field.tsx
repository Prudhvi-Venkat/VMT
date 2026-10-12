import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: ReactNode;
  /** Rendered as a red asterisk after the label. */
  required?: boolean;
  htmlFor?: string;
  /** Small helper text rendered below the control. */
  hint?: ReactNode;
  /** Extra classes for the label element itself. */
  labelClassName?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + hint wrapper used by every form in the app.
 * Replaces the repeated `<label className="text-xs font-semibold ...">` blocks.
 */
export function Field({
  label,
  required,
  htmlFor,
  hint,
  labelClassName,
  className,
  children,
}: FieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className={cn("text-xs font-semibold text-foreground mb-2 block", labelClassName)}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
}
