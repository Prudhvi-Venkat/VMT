import { apiSlice } from './api-slice';
import type { Finding, FindingStatus } from '@/lib/types';
import { adaptFinding, mapFindingStatusToBackend, type BackendFindingResponse } from '@/lib/scanner-adapter';

export interface FindingQueryParams {
  search?: string;
  severity?: string;
  status?: string;
  projectId?: string;
  active?: boolean;
  page?: number;
  limit?: number;
  offset?: number;
  [key: string]: string | number | boolean | undefined;
}

export const findingsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getFindings: builder.query<Finding[], FindingQueryParams | void>({
      query: (params) => {
        if (!params) return '/findings';
        const { page, limit, offset, ...rest } = params;
        const computedOffset = offset !== undefined ? offset : (page !== undefined ? (Math.max(1, page) - 1) * (limit || 100) : undefined);
        const queryObj: Record<string, string | number | boolean | undefined> = { ...rest };
        if (limit !== undefined) queryObj.limit = limit;
        if (page !== undefined) queryObj.page = page;
        if (computedOffset !== undefined) queryObj.offset = computedOffset;

        const queryEntries = Object.entries(queryObj).filter(([, val]) => val !== undefined);
        const qs = queryEntries.length > 0 ? new URLSearchParams(queryEntries.map(([k, v]) => [k, String(v)])).toString() : '';
        return `/findings${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (res: { items?: BackendFindingResponse[] } | BackendFindingResponse[]) => {
        const raw = Array.isArray(res) ? res : res?.items || [];
        return raw.map((f) => adaptFinding(f));
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Finding' as const, id })),
              { type: 'Finding', id: 'LIST' },
            ]
          : [{ type: 'Finding', id: 'LIST' }],
    }),

    getScanFindings: builder.query<Finding[], string>({
      query: (scanId) => `/scans/${encodeURIComponent(scanId)}/findings`,
      transformResponse: (res: { items?: BackendFindingResponse[] } | BackendFindingResponse[]) => {
        const raw = Array.isArray(res) ? res : res?.items || [];
        return raw.map((f) => adaptFinding(f));
      },
      providesTags: (_result, _error, scanId) => [
        { type: 'Scan', id: scanId },
        { type: 'Finding', id: 'LIST' },
      ],
    }),

    updateFindingStatus: builder.mutation<
      { success: boolean; data: Record<string, unknown>; message?: string },
      { findingId: string; status: FindingStatus | string; reason?: string; comment?: string }
    >({
      query: ({ findingId, status, reason, comment }) => {
        const backendStatus = mapFindingStatusToBackend(status as FindingStatus);
        return {
          url: `/findings/${encodeURIComponent(findingId)}/status`,
          method: 'PATCH',
          body: {
            status: backendStatus,
            justificationNote: reason || comment,
            reason: reason || comment,
          },
        };
      },
      invalidatesTags: (_result, _error, { findingId }) => [
        { type: 'Finding', id: findingId },
        { type: 'Finding', id: 'LIST' },
        { type: 'Dashboard', id: 'ALL' },
      ],
    }),

    assignFinding: builder.mutation<
      { success: boolean; data: Record<string, unknown>; message?: string },
      { findingId: string; assignedTo: string; assignedUserName?: string }
    >({
      query: ({ findingId, assignedTo, assignedUserName }) => ({
        url: `/findings/${encodeURIComponent(findingId)}/assign`,
        method: 'PATCH',
        body: { assignedTo, assignedUserName },
      }),
      invalidatesTags: (_result, _error, { findingId }) => [
        { type: 'Finding', id: findingId },
        { type: 'Finding', id: 'LIST' },
      ],
    }),

  }),
});

export const {
  useGetFindingsQuery,
  useLazyGetFindingsQuery,
  useGetScanFindingsQuery,
  useLazyGetScanFindingsQuery,
  useUpdateFindingStatusMutation,
  useAssignFindingMutation,
} = findingsApi;
