import type { DependencyScope, FindingStatus, Severity } from "./severity";

export interface Finding {
  id: string;
  tenant_id: string;
  fingerprint: string;
  title: string;
  description: string;
  severity: Severity;
  status: FindingStatus;
  risk_score: number;
  risk_band: Severity;
  risk_factors: {
    cvss: number;
    epss: number;
    exploit: number;
    criticality: number;
    exposure: number;
  };
  cvss_score?: number;
  cvss_vector?: string;
  epss_score?: number;
  cve_id?: string;
  osv_id?: string;
  cwes?: string[];
  kev?: boolean;
  exploit_maturity: "none" | "poc" | "weaponized" | "kev";
  asset_id?: string;
  assetId?: string;
  asset_name?: string;
  component_name?: string;
  component_version?: string;
  declared_range?: string;
  dependency_scope?: DependencyScope;
  project_id?: string;
  projectId?: string;
  project_name?: string;
  scan_id?: string;
  scanId?: string;
  tenantId?: string;
  workspace?: string;
  fixed_version?: string;
  affected_range?: string;
  source: string;
  owner: string;
  sla_due_at: string;
  first_seen: string;
  last_seen: string;
  closed_at?: string;
  sample?: boolean;
  warnings?: string[];
  // Backend scanner enriched fields
  match_method?: string;
  match_confidence?: number;
  matched_identifier?: string;
  available_actions?: string[];
  provenance?: {
    componentSource?: string;
    vulnerabilitySource?: string;
    matchedRule?: string;
    intelligenceUpdatedAt?: string;
  };
  remediation?: {
    currentVersion?: string | null;
    fixedVersions?: string[];
    recommendedVersion?: string | null;
  };
  purl?: string;
  assignedTo?: string;
  assignedUserName?: string;
  assignedAt?: string;
  assignedBy?: string;
  risk_explanation?: string;
  risk_policy_id?: string;
}
