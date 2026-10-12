/** Tenant-admin dashboard entities (users, projects, audit, integrations, assets). */

export interface TenantUser {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  employeeId?: string;
  department?: string;
  roles?: string[];
  assignedProjectIds?: string[];
  status?: string;
  createdAt?: string;
}

export interface TenantProject {
  id: string;
  name: string;
  key?: string;
  description?: string;
  department?: string;
  startDate?: string;
  endDate?: string;
  stage?: string;
  cloudProvider?: string;
  cloudMetadata?: Record<string, unknown>;
  status?: string;
  membersCount?: number;
  members?: unknown[];
  riskProfile?: string;
  createdAt?: string;
}

export interface TenantAuditLog {
  id: string;
  timestamp: string;
  action: string;
  userId?: string;
  actor?: { userId?: string };
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
}

export interface TenantIntegration {
  id: string;
  name: string;
  provider: string;
  type?: string;
  projectId?: string | null;
  status?: string;
  createdAt?: string;
}

export interface TenantAsset {
  id: string;
  name: string;
  type?: string;
  environment?: string;
  criticality?: number | string;
  exposure?: string;
  ipAddress?: string;
  location?: string;
  hostname?: string;
  owner?: string;
  projectId?: string;
  platform?: string;
  description?: string;
  tags?: string[];
  createdAt?: string;
}
