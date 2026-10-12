import type { DependencyScope } from "./severity";

export interface SbomComponent {
  id: string;
  scan_id: string;
  tenant_id: string;
  name: string;
  version: string;
  ecosystem: string;
  purl?: string;
  declared_range?: string;
  scope?: DependencyScope;
  project_name?: string;
  workspace?: string;
  supplier?: string;
  unresolved: boolean;
  warnings: string[];
}

export type ScanStatus =
  | "QUEUED"
  | "PARSING"
  | "NORMALIZING"
  | "MATCHING"
  | "ENRICHING"
  | "COMPLETED"
  | "COMPLETED_WITH_WARNINGS"
  | "FAILED"
  | "CANCELLED"
  // Legacy local statuses
  | "completed"
  | "partial"
  | "failed"
  | "processing";

export interface ScanProgress {
  stage: string;
  totalComponents: number;
  processedComponents: number;
  percentage: number;
}

export interface ScanSeverityBreakdown {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

export interface SbomScan {
  id: string;
  tenant_id: string;
  project_id?: string;
  projectId?: string;
  asset_id?: string;
  assetId?: string;
  filename: string;
  format: "cyclonedx-json" | "cyclonedx-xml" | "spdx-json" | "spdx-xml" | "spdx-tag-value" | "package-json" | string;
  status: ScanStatus;
  component_count: number;
  vulnerable_count: number;
  unresolved_count: number;
  warning_count: number;
  size_bytes: number;
  checksum: string;
  created_at: string;
  completed_at?: string;
  warnings: string[];
  // Backend scanner extended fields
  progress?: ScanProgress;
  severity?: ScanSeverityBreakdown;
  finding_count?: number;
  error?: { code: string; message: string } | null;
  started_at?: string;
}

export interface InspectComponent {
  name: string;
  version?: string;
  declaredVersion?: string | null;
  resolvedVersion?: string | null;
  versionConstraint?: string | null;
  vendor?: string;
  ecosystem: string;
  scope?: string;
  license?: string;
  purl?: string;
}

export interface InspectScanResponse {
  success: boolean;
  data: {
    filename: string;
    fileType: string;
    totalComponents: number;
    components: InspectComponent[];
    warnings?: string[];
  };
}

export interface UploadScanParams {
  file?: File;
  filename?: string;
  content?: string;
  base64Content?: string;
  projectId?: string;
  assetId?: string;
  reviewedComponents?: InspectComponent[] | Record<string, unknown>[];
}

export interface UploadScanResponse {
  scanId: string;
  status: string;
  message: string;
}

export interface ScanResponse {
  scanId: string;
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
