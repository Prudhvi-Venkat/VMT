/** Platform-admin dashboard entities. */

export interface TenantItem {
  id?: string;
  tenantKey: string;
  name: string;
  displayName?: string;
  databaseName?: string;
  complianceFramework?: string;
  cloudProvider?: string;
  status: string;
  createdAt: string;
  superAdminEmail?: string;
  superAdminId?: string;
}

export interface PlatformAdminUser {
  id: string;
  name?: string;
  email: string;
  roles?: string[];
  createdAt?: string;
}
