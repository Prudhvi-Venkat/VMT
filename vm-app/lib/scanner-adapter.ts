/**
 * scanner-adapter.ts
 * 
 * Normalizes backend VulnerabilityScannerSerializer JSON payloads
 * into the frontend Finding and SbomScan data formats used by vm-console.tsx.
 * 
 * Backend serializer shapes (from vulnerability-scanner.serializer.js):
 *   - serializeScan → { scanId, name, originalFileName, fileType, ... }
 *   - serializeFinding → { findingId, component: {...}, vulnerability: {...}, versionEvidence: {...}, match: {...}, ... }
 *   - serializePaginated → { items: [...], pagination: { page, limit, total, totalPages } }
 */

import type { Finding, Severity, SbomScan } from "./types";
import { riskBand, slaHours } from "./risk";

// ─── Backend response shapes (matching vulnerability-scanner.serializer.js) ───

export interface BackendScanResponse {
  scanId: string;
  tenantId?: string | null;
  projectId?: string | null;
  assetId?: string | null;
  name: string;
  originalFileName: string;
  fileType: string;
  fileSize: number;
  checksum: string;
  status: string;
  componentCount: number;
  vulnerableComponentCount: number;
  findingCount: number;
  severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
  };
  warningCount: number;
  warnings: string[];
  progress: {
    stage: string;
    totalComponents: number;
    processedComponents: number;
    percentage: number;
  };
  error: { code: string; message: string } | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackendFindingResponse {
  findingId: string;
  scanId?: string | null;
  projectId?: string | null;
  assetId?: string | null;
  tenantId?: string | null;
  component: {
    name: string;
    version: string;
    ecosystem: string;
    purl: string | null;
    scope?: string;
  };
  vulnerability: {
    cveId: string;
    aliases: string[];
    severity: string;
    cvssScore: number | null;
    cvssVector: string | null;
    epss: number | null;
    cisaKev: boolean;
    cwes: string[];
    description: string;
    references: string[];
  };
  versionEvidence: {
    installedVersion: string;
    affectedRange: string;
    fixedVersions: string[];
  };
  match: {
    method: string;
    confidence: number;
    matchedIdentifier: string | null;
  };
  status: string;
  risk: {
    score: number;
    severity: string;
    factors: Record<string, number>;
    explanation?: string;
    policyId?: string;
  };
  remediation: {
    currentVersion: string | null;
    fixedVersions: string[];
    recommendedVersion: string | null;
  } | null;
  availableActions: string[];
  sourceProvenance: {
    componentSource: string;
    vulnerabilitySource: string;
    matchedRule: string;
    intelligenceUpdatedAt: string;
  };
  assignedTo?: string | null;
  assignedUserName?: string | null;
  assignedAt?: string | null;
  assignedBy?: string | null;
  createdAt: string;
}

export interface BackendPaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface BackendComponentResponse {
  componentId: string;
  name: string;
  namespace: string | null;
  version: string;
  declaredVersion: string | null;
  resolvedVersion: string | null;
  ecosystem: string;
  packageManager: string;
  purl: string | null;
  cpe: string | null;
  scope: string;
  directDependency: boolean;
  dependencyDepth: number;
  vulnerable: boolean;
  vulnerabilitiesCount: number;
  resolutionStatus: string;
  resolutionMethod: string | null;
  resolutionConfidence: number;
  sourceFile: string;
}

// ─── Mapping helpers ─────────────────────────────────────────────────────────

function mapSeverity(backendSeverity: string): Severity {
  const mapping: Record<string, Severity> = {
    CRITICAL: "critical",
    HIGH: "high",
    MEDIUM: "medium",
    LOW: "low",
    UNKNOWN: "info",
  };
  return mapping[backendSeverity.toUpperCase()] ?? "info";
}

function mapExploitMaturity(cisaKev: boolean, severity: string): "none" | "poc" | "weaponized" | "kev" {
  if (cisaKev) return "kev";
  // Infer from severity if KEV data isn't available
  if (severity === "CRITICAL") return "poc";
  return "none";
}

function mapFindingStatus(backendStatus: string): Finding["status"] {
  const mapping: Record<string, Finding["status"]> = {
    OPEN: "open",
    TRIAGED: "assigned",
    IN_PROGRESS: "in_progress",
    MITIGATED: "remediated",
    RESOLVED: "closed",
    FALSE_POSITIVE: "false_positive",
    ACCEPTED_RISK: "accepted_risk",
  };
  return mapping[backendStatus] ?? "open";
}

/**
 * Normalizes frontend FindingStatus string to canonical backend FindingStatus enum.
 */
export function mapFindingStatusToBackend(status: Finding["status"] | string): string {
  const s = String(status || "open").toLowerCase();
  switch (s) {
    case "remediated":
    case "mitigated":
      return "RESOLVED";
    case "closed":
    case "resolved":
      return "RESOLVED";
    case "in_progress":
      return "IN_PROGRESS";
    case "accepted_risk":
      return "ACCEPTED_RISK";
    case "false_positive":
      return "FALSE_POSITIVE";
    case "assigned":
    case "triaged":
      return "TRIAGED";
    case "reopened":
      return "REOPENED";
    case "open":
    default:
      return "OPEN";
  }
}

export function mapDependencyScope(scope?: string): Finding['dependency_scope'] {
  if (!scope) return "production";
  const s = scope.toLowerCase();
  if (s.includes("dev")) return "development";
  if (s.includes("opt")) return "optional";
  if (s.includes("peer")) return "peer";
  if (s.includes("bundle")) return "bundled";
  return "production";
}

// ─── Adapter functions ───────────────────────────────────────────────────────

/**
 * Converts a backend serialized scan response into the frontend SbomScan type.
 */
export function adaptScan(backend: BackendScanResponse): SbomScan {
  const status = backend.status;
  return {
    id: backend.scanId,
    tenant_id: backend.tenantId ?? "",
    project_id: backend.projectId ?? undefined,
    projectId: backend.projectId ?? undefined,
    asset_id: backend.assetId ?? undefined,
    assetId: backend.assetId ?? undefined,
    filename: backend.originalFileName,
    format: backend.fileType || "unknown",
    status: status as SbomScan["status"],
    component_count: backend.componentCount ?? 0,
    vulnerable_count: backend.vulnerableComponentCount ?? 0,
    unresolved_count: 0, // not in backend serializer
    warning_count: backend.warningCount ?? 0,
    size_bytes: backend.fileSize ?? 0,
    checksum: backend.checksum ?? "",
    created_at: backend.createdAt,
    completed_at: backend.completedAt ?? undefined,
    warnings: backend.warnings ?? [],
    progress: backend.progress ?? undefined,
    severity: backend.severity ?? undefined,
    finding_count: backend.findingCount ?? 0,
    error: backend.error ?? undefined,
    started_at: backend.startedAt ?? undefined,
  };
}

/**
 * Converts a backend serialized finding into the frontend Finding type.
 */
export function adaptFinding(backend: BackendFindingResponse, scanFilename?: string): Finding {
  const severity = mapSeverity(backend.vulnerability.severity);
  const now = new Date().toISOString();

  // Build risk_factors from backend risk.factors or from raw scores
  const factors = backend.risk?.factors ?? {};
  const cvssBase = factors.cvssBase ?? backend.vulnerability.cvssScore ?? 0;
  const epssScore = factors.epssScore ?? backend.vulnerability.epss ?? 0;
  const severityCriticality: Record<string, number> = {
    CRITICAL: 10,
    HIGH: 8,
    MEDIUM: 5,
    LOW: 2,
  };
  const riskFactors = {
    cvss: factors.cvss ?? cvssBase * 5,
    epss: factors.epss ?? epssScore * 20,
    exploit: factors.exploit ?? (backend.vulnerability.cisaKev ? 15 : 0),
    criticality: factors.criticality ?? severityCriticality[backend.vulnerability.severity.toUpperCase()] ?? 5,
    exposure: factors.exposure ?? 2,
  };
  // Risk is a 0-100 composite. Older findings may still contain a backend
  // score on the old 0-10 scale, so calculate from the displayed factors to
  // keep list and detail views consistent for both old and new records.
  const riskScore = Math.round(Math.min(
    100,
    Object.values(riskFactors).reduce(
      (sum, value) => sum + (typeof value === "number" ? value : 0),
      0,
    ),
  ));
  const band = backend.risk?.severity ? mapSeverity(backend.risk.severity) : riskBand(riskScore);

  const sla = slaHours(band);
  const fingerprint = `${backend.component.ecosystem}:${backend.component.name}:${backend.component.version}:${backend.vulnerability.cveId}`;

  return {
    id: backend.findingId,
    tenant_id: backend.tenantId ?? "",
    tenantId: backend.tenantId ?? undefined,
    project_id: backend.projectId ?? undefined,
    projectId: backend.projectId ?? undefined,
    scan_id: backend.scanId ?? undefined,
    scanId: backend.scanId ?? undefined,
    asset_id: backend.assetId ?? undefined,
    assetId: backend.assetId ?? undefined,
    fingerprint,
    title: backend.vulnerability.description
      ? backend.vulnerability.description.slice(0, 120)
      : `${backend.vulnerability.cveId} in ${backend.component.name}`,
    description: backend.vulnerability.description || "",
    severity,
    status: mapFindingStatus(backend.status),
    risk_score: Math.round(riskScore),
    risk_band: band,
    risk_factors: riskFactors,
    cvss_score: backend.vulnerability.cvssScore ?? undefined,
    cvss_vector: backend.vulnerability.cvssVector ?? undefined,
    epss_score: backend.vulnerability.epss ?? undefined,
    cve_id: backend.vulnerability.cveId,
    osv_id: backend.vulnerability.aliases?.[0] ?? undefined,
    cwes: backend.vulnerability.cwes ?? [],
    kev: backend.vulnerability.cisaKev,
    exploit_maturity: mapExploitMaturity(backend.vulnerability.cisaKev, backend.vulnerability.severity),
    component_name: backend.component.name,
    component_version: backend.component.version,
    declared_range: undefined,
    dependency_scope: mapDependencyScope(backend.component.scope),
    project_name: undefined,
    workspace: undefined,
    fixed_version: backend.remediation?.recommendedVersion ?? backend.versionEvidence.fixedVersions?.[0] ?? undefined,
    affected_range: backend.versionEvidence.affectedRange,
    source: scanFilename ? `SBOM Scanner: ${scanFilename}` : "SBOM Scanner",
    owner: "Unassigned",
    sla_due_at: new Date(Date.now() + sla * 3600000).toISOString(),
    first_seen: backend.createdAt ?? now,
    last_seen: now,
    // Extended backend fields
    match_method: backend.match.method,
    match_confidence: backend.match.confidence,
    matched_identifier: backend.match.matchedIdentifier ?? undefined,
    available_actions: backend.availableActions ?? [],
    provenance: backend.sourceProvenance
      ? {
          componentSource: backend.sourceProvenance.componentSource,
          vulnerabilitySource: backend.sourceProvenance.vulnerabilitySource,
          matchedRule: backend.sourceProvenance.matchedRule,
          intelligenceUpdatedAt: backend.sourceProvenance.intelligenceUpdatedAt,
        }
      : undefined,
    remediation: backend.remediation
      ? {
          currentVersion: backend.remediation.currentVersion ?? undefined,
          fixedVersions: backend.remediation.fixedVersions ?? [],
          recommendedVersion: backend.remediation.recommendedVersion ?? undefined,
        }
      : undefined,
    purl: backend.component.purl ?? undefined,
    assignedTo: backend.assignedTo ?? undefined,
    assignedUserName: backend.assignedUserName ?? undefined,
    assignedAt: backend.assignedAt ?? undefined,
    assignedBy: backend.assignedBy ?? undefined,
    risk_explanation: backend.risk?.explanation ?? undefined,
    risk_policy_id: backend.risk?.policyId ?? undefined,
  };
}

/**
 * Returns true if the scan status is terminal (no more polling needed).
 */
export function isScanTerminal(status: string): boolean {
  const s = (status || "").toUpperCase();
  return ["COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED", "CANCELLED", "PARTIAL"].includes(s);
}

/**
 * Returns human-friendly label for scan stage.
 */
export function scanStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    QUEUED: "Queued",
    PARSING: "Parsing manifest…",
    NORMALIZING: "Normalizing components…",
    MATCHING: "Matching vulnerabilities…",
    ENRICHING: "Enriching intelligence…",
    COMPLETED: "Completed",
    COMPLETED_WITH_WARNINGS: "Completed with warnings",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
  };
  return labels[stage] ?? stage;
}
