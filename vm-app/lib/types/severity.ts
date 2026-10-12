/** Core enum-like unions shared across findings, assets, and scans. */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type FindingStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "remediated"
  | "verified"
  | "closed"
  | "accepted_risk"
  | "false_positive";

export type DependencyScope =
  | "production"
  | "development"
  | "optional"
  | "peer"
  | "bundled";
