import { apiSlice } from './api-slice';
import type { TenantAuditLog } from '@/lib/types';

export interface AuditLogQueryParams {
  scope?: 'tenant' | 'platform';
  limit?: number;
  page?: number;
  action?: string;
  userId?: string;
  severity?: string;
  startDate?: string;
  endDate?: string;
  [key: string]: string | number | undefined;
}

export const auditApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAuditLogs: builder.query<
      { success: boolean; data: TenantAuditLog[]; pagination?: { page: number; limit: number; total: number; totalPages: number } },
      AuditLogQueryParams | void
    >({
      query: (params) => {
        const { scope = 'tenant', page, limit, offset, ...rest } = params || {};
        const computedOffset = offset !== undefined ? offset : (page !== undefined ? (Math.max(1, page) - 1) * (limit || 100) : undefined);
        const queryObj: Record<string, string | number | undefined> = { ...rest };
        if (limit !== undefined) queryObj.limit = limit;
        if (page !== undefined) queryObj.page = page;
        if (computedOffset !== undefined) queryObj.offset = computedOffset;

        const queryEntries = Object.entries(queryObj).filter(([, val]) => val !== undefined);
        const qs = queryEntries.length > 0 ? new URLSearchParams(queryEntries.map(([k, v]) => [k, String(v)])).toString() : '';
        const endpoint = scope === 'platform' ? '/platform/audit' : '/tenant/audit';
        return `${endpoint}${qs ? `?${qs}` : ''}`;
      },
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'AuditLog' as const, id })),
              { type: 'AuditLog', id: 'LIST' },
              { type: 'Audit', id: 'LIST' },
            ]
          : [
              { type: 'AuditLog', id: 'LIST' },
              { type: 'Audit', id: 'LIST' },
            ],
    }),

    // Backwards-compatible alias for existing getTenantAuditLogs calls
    getTenantAuditLogs: builder.query<
      { success: boolean; data: TenantAuditLog[] },
      Record<string, string> | void
    >({
      query: (params) => {
        if (!params) return '/tenant/audit';
        const qs = new URLSearchParams(params).toString();
        return `/tenant/audit${qs ? `?${qs}` : ''}`;
      },
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'AuditLog' as const, id })),
              { type: 'AuditLog', id: 'LIST' },
            ]
          : [{ type: 'AuditLog', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetAuditLogsQuery,
  useLazyGetAuditLogsQuery,
  useGetTenantAuditLogsQuery,
  useLazyGetTenantAuditLogsQuery,
} = auditApi;
