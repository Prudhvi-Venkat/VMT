import { apiSlice } from './api-slice';
import type { TenantAsset, Asset } from '@/lib/types';

export interface CreateAssetInput {
  name: string;
  type?: string;
  environment?: string;
  criticality?: string | number;
  exposure?: string;
  ipAddress?: string;
  hostname?: string;
  owner?: string;
  projectId?: string;
  platform?: string;
  description?: string;
  tags?: string[];
}

export const assetsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAssets: builder.query<
      { success: boolean; data: TenantAsset[] },
      Record<string, string> | void
    >({
      query: (params) => {
        if (!params) return '/tenant/assets';
        const qs = new URLSearchParams(params).toString();
        return `/tenant/assets${qs ? `?${qs}` : ''}`;
      },
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'Asset' as const, id })),
              { type: 'Asset', id: 'LIST' },
            ]
          : [{ type: 'Asset', id: 'LIST' }],
    }),

    createAsset: builder.mutation<
      { success: boolean; data: TenantAsset; message?: string },
      CreateAssetInput
    >({
      query: (body) => ({
        url: '/tenant/assets',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Asset', id: 'LIST' }],
    }),

    updateAsset: builder.mutation<
      { success: boolean; data: TenantAsset; message?: string },
      { id: string; [key: string]: unknown }
    >({
      query: ({ id, ...body }) => ({
        url: `/tenant/assets/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Asset', id },
        { type: 'Asset', id: 'LIST' },
      ],
    }),

    deleteAsset: builder.mutation<
      { success: boolean; message?: string },
      string
    >({
      query: (id) => ({
        url: `/tenant/assets/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Asset', id },
        { type: 'Asset', id: 'LIST' },
      ],
    }),

    // Backwards-compatible aliases
    getTenantAssets: builder.query<
      { success: boolean; data: TenantAsset[] },
      Record<string, string> | void
    >({
      query: (params) => {
        if (!params) return '/tenant/assets';
        const qs = new URLSearchParams(params).toString();
        return `/tenant/assets${qs ? `?${qs}` : ''}`;
      },
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'Asset' as const, id })),
              { type: 'Asset', id: 'LIST' },
            ]
          : [{ type: 'Asset', id: 'LIST' }],
    }),

    createTenantAsset: builder.mutation<
      { success: boolean; data: TenantAsset; message?: string },
      CreateAssetInput
    >({
      query: (body) => ({
        url: '/tenant/assets',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Asset', id: 'LIST' }],
    }),

    updateTenantAsset: builder.mutation<
      { success: boolean; data: TenantAsset; message?: string },
      { id: string; [key: string]: unknown }
    >({
      query: ({ id, ...body }) => ({
        url: `/tenant/assets/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Asset', id },
        { type: 'Asset', id: 'LIST' },
      ],
    }),

    deleteTenantAsset: builder.mutation<
      { success: boolean; message?: string },
      string
    >({
      query: (id) => ({
        url: `/tenant/assets/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Asset', id },
        { type: 'Asset', id: 'LIST' },
      ],
    }),
  }),
});

export function normalizeBackendAsset(a: Record<string, unknown>): Asset {
  let criticalityNum: 1 | 2 | 3 | 4 = 3;
  if (typeof a.criticality === 'number' && [1, 2, 3, 4].includes(a.criticality)) {
    criticalityNum = a.criticality as 1 | 2 | 3 | 4;
  } else if (typeof a.criticality === 'string') {
    const m = a.criticality.match(/TIER_(\d)/i);
    if (m) criticalityNum = parseInt(m[1], 10) as 1 | 2 | 3 | 4;
  }

  let exposureVal: 'internet' | 'internal' | 'air-gapped' = 'internal';
  if (a.exposure === 'internet' || a.internetFacing === true) exposureVal = 'internet';
  else if (a.exposure === 'air-gapped') exposureVal = 'air-gapped';

  let ownerStr = 'Security Team';
  if (typeof a.owner === 'string' && a.owner) ownerStr = a.owner;
  else if (typeof a.owner === 'object' && a.owner !== null) {
    const o = a.owner as { email?: string; teamId?: string; businessUnit?: string };
    ownerStr = o.email || o.teamId || o.businessUnit || 'Security Team';
  }

  return {
    id: String(a.id || `ast_${Date.now()}`),
    tenant_id: String(a.tenantId || a.tenant_id || ''),
    name: String(a.name || 'Asset'),
    type: (a.type as Asset['type']) || 'server',
    environment: (String(a.environment || 'production').toLowerCase() as Asset['environment']),
    criticality: criticalityNum,
    owner: ownerStr,
    exposure: exposureVal,
    location: String(a.location || a.ipAddress || a.hostname || 'us-east-1'),
    status: (a.status === 'decommissioned' ? 'decommissioned' : 'active') as Asset['status'],
  };
}

export const {
  useGetAssetsQuery,
  useLazyGetAssetsQuery,
  useCreateAssetMutation,
  useUpdateAssetMutation,
  useDeleteAssetMutation,
  useGetTenantAssetsQuery,
  useLazyGetTenantAssetsQuery,
  useCreateTenantAssetMutation,
  useUpdateTenantAssetMutation,
  useDeleteTenantAssetMutation,
} = assetsApi;
