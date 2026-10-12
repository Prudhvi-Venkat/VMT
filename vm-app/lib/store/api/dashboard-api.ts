import { apiSlice } from './api-slice';

export interface PlatformDashboardData {
  tenants: {
    total: number;
    active: number;
    suspended: number;
    disabled: number;
    pending: number;
  };
  aggregates: {
    totalScans: number;
    totalFindings: number;
    totalUsers: number;
  };
  system: {
    status: string;
    uptimeSeconds: number;
    nodeVersion: string;
    memoryUsageMb: number;
    timestamp: string;
  };
  recentTenants: Array<{
    tenantKey: string;
    name: string;
    status: string;
    createdAt: string;
  }>;
}

export interface TenantDashboardData {
  range: string;
  days: number;
  overview: {
    totalProjects: number;
    activeProjects: number;
    totalScans: number;
    completedScans: number;
    failedScans: number;
    avgDurationMs: number;
    riskPostureScore: number;
  };
  findings: {
    total: number;
    active: number;
    severity: {
      CRITICAL: number;
      HIGH: number;
      MEDIUM: number;
      LOW: number;
      UNKNOWN: number;
    };
    status: {
      OPEN: number;
      IN_REVIEW: number;
      RESOLVED: number;
      FALSE_POSITIVE: number;
      RISK_ACCEPTED: number;
    };
    sla: {
      withinSla: number;
      breachedSla: number;
      complianceRate: number;
    };
  };
  timeline: Array<{
    date: string;
    detected: number;
    resolved: number;
  }>;
  topProjects: Array<{
    id: string;
    name: string;
    key: string;
    critical: number;
    high: number;
    total: number;
  }>;
}

export interface ProjectDashboardData {
  project: {
    id: string;
    name: string;
    key: string;
    description?: string;
    status: string;
    createdAt: string;
  };
  metrics: {
    totalFindings: number;
    activeFindings: number;
    severity: Record<string, number>;
    status: Record<string, number>;
  };
  recentScans: Array<{
    id: string;
    status: string;
    componentCount: number;
    findingCount: number;
    createdAt: string;
  }>;
  topVulnerabilities: Array<{
    findingId: string;
    vulnerabilityId: string;
    packageName: string;
    installedVersion: string;
    severity: string;
    cvssScore: number;
    remediation?: string;
  }>;
}

export interface MeDashboardData {
  summary: {
    accessibleProjectsCount: number;
    recentScansCount: number;
    assignedFindingsCount: number;
    urgentActionRequired: number;
  };
  accessibleProjects: Array<{ id: string; name: string; key: string }>;
  recentScans: Array<{
    id: string;
    name: string;
    status: string;
    findingCount: number;
    createdAt: string;
  }>;
  urgentFindings: Array<{
    id: string;
    cveId: string;
    packageName: string;
    severity: string;
    cvssScore: number;
    createdAt: string;
  }>;
}

export const dashboardApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPlatformDashboard: builder.query<{ success: boolean; data: PlatformDashboardData }, void>({
      query: () => '/platform/dashboard',
      providesTags: [{ type: 'Dashboard', id: 'PLATFORM' }],
    }),

    getTenantDashboard: builder.query<{ success: boolean; data: TenantDashboardData }, { range?: string; tenantId?: string } | void>({
      query: (arg) => {
        const { range = '30d', tenantId } = arg || {};
        let url = `/tenant/dashboard?range=${range}`;
        if (tenantId) url += `&tenantId=${encodeURIComponent(tenantId)}`;
        return url;
      },
      providesTags: (_result, _error, arg) => [{ type: 'Dashboard', id: `TENANT-${arg?.range || '30d'}` }],
    }),

    getProjectDashboard: builder.query<{ success: boolean; data: ProjectDashboardData }, string>({
      query: (projectId) => `/projects/${encodeURIComponent(projectId)}/dashboard`,
      providesTags: (result, error, projectId) => [{ type: 'Dashboard', id: `PROJECT-${projectId}` }],
    }),

    getMeDashboard: builder.query<{ success: boolean; data: MeDashboardData }, void>({
      query: () => '/me/dashboard',
      providesTags: [{ type: 'Dashboard', id: 'ME' }],
    }),
  }),
});

export const {
  useGetPlatformDashboardQuery,
  useGetTenantDashboardQuery,
  useGetProjectDashboardQuery,
  useGetMeDashboardQuery,
} = dashboardApi;
