/**
 * Shared severity / finding-status badge color maps and label helpers.
 * Used by StatusBadge-style components so badge styling stays consistent
 * across the console, dashboards, and reports.
 */

export const severityColors: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-700 hover:bg-red-50",
  high: "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-50",
  medium: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50",
  low: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50",
  info: "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100",
};

export const findingStatusColors: Record<string, string> = {
  open: "text-red-700 bg-red-50 border-red-200",
  assigned: "text-amber-700 bg-amber-50 border-amber-200",
  in_progress: "text-blue-700 bg-blue-50 border-blue-200",
  remediated: "text-emerald-700 bg-emerald-50 border-emerald-200",
  accepted_risk: "text-purple-700 bg-purple-50 border-purple-200",
  closed: "text-emerald-700 bg-emerald-50 border-emerald-200",
  verified: "text-emerald-700 bg-emerald-50 border-emerald-200",
  false_positive: "text-slate-600 bg-slate-100 border-slate-200",
};

/** "in_progress" -> "In Progress" */
export function toLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Severity label with historical casing ("Critical", "Info"). */
export function toSeverityLabel(value?: string | null): string {
  const v = (value ?? "info").toLowerCase();
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : "Info";
}
