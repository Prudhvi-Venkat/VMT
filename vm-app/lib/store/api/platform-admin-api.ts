import { apiSlice } from './api-slice';
import type { TenantItem, PlatformAdminUser } from '@/lib/types';

export interface CreateTenantInput {
  name: string;
  tenantKey?: string;
  superAdminEmail: string;
  superAdminPassword?: string;
  superAdminFirstName?: string;
  superAdminLastName?: string;
}

export interface RegisterPlatformAdminInput {
  name: string;
  email: string;
  password?: string;
  roles?: string[];
}

export const platformAdminApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getTenants: builder.query<{ success: boolean; data: TenantItem[] }, void>({
      query: () => '/platform/tenants',
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ tenantKey }) => ({ type: 'Tenant' as const, id: tenantKey })),
              { type: 'Tenant', id: 'LIST' },
            ]
          : [{ type: 'Tenant', id: 'LIST' }],
    }),

    listPlatformAdmins: builder.query<{ success: boolean; data: PlatformAdminUser[] }, void>({
      query: () => '/platform/platform-admins',
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'PlatformAdmin' as const, id })),
              { type: 'PlatformAdmin', id: 'LIST' },
            ]
          : [{ type: 'PlatformAdmin', id: 'LIST' }],
    }),

    createTenant: builder.mutation<Record<string, unknown>, CreateTenantInput>({
      query: (data) => ({
        url: '/platform/tenants',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [
        { type: 'Tenant', id: 'LIST' },
        { type: 'Dashboard', id: 'PLATFORM' },
      ],
    }),

    updateTenant: builder.mutation<
      { success: boolean; data: Record<string, unknown> },
      { tenantKey: string; data: Record<string, unknown> }
    >({
      query: ({ tenantKey, data }) => ({
        url: `/platform/tenants/${encodeURIComponent(tenantKey)}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (result, error, { tenantKey }) => [
        { type: 'Tenant', id: tenantKey },
        { type: 'Tenant', id: 'LIST' },
        { type: 'Dashboard', id: 'PLATFORM' },
      ],
    }),

    resetSuperAdminPassword: builder.mutation<
      { success: boolean; message: string },
      { tenantKey: string; userId: string; newPassword: string }
    >({
      query: ({ tenantKey, userId, newPassword }) => ({
        url: `/platform/tenants/${encodeURIComponent(tenantKey)}/super-admins/${encodeURIComponent(userId)}/reset-password`,
        method: 'POST',
        body: { newPassword },
      }),
    }),

    listSuperAdmins: builder.query<{ success: boolean; data: Record<string, unknown>[] }, string>({
      query: (tenantKey) => `/platform/tenants/${encodeURIComponent(tenantKey)}/super-admins`,
      providesTags: (_result, _error, tenantKey) => [{ type: 'Tenant', id: `${tenantKey}-super-admins` }],
    }),

    createSuperAdmin: builder.mutation<
      Record<string, unknown>,
      { tenantKey: string; email: string; password?: string; firstName?: string; lastName?: string }
    >({
      query: ({ tenantKey, ...body }) => ({
        url: `/platform/tenants/${encodeURIComponent(tenantKey)}/super-admins`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { tenantKey }) => [
        { type: 'Tenant', id: `${tenantKey}-super-admins` },
        { type: 'Tenant', id: tenantKey },
      ],
    }),

    updateSuperAdmin: builder.mutation<
      { success: boolean; data: Record<string, unknown> },
      { tenantKey: string; userId: string; data: Record<string, unknown> }
    >({
      query: ({ tenantKey, userId, data }) => ({
        url: `/platform/tenants/${encodeURIComponent(tenantKey)}/super-admins/${encodeURIComponent(userId)}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { tenantKey }) => [
        { type: 'Tenant', id: `${tenantKey}-super-admins` },
      ],
    }),

    registerPlatformAdmin: builder.mutation<
      { success: boolean; data: Record<string, unknown> },
      RegisterPlatformAdminInput
    >({
      query: (data) => ({
        url: '/platform/platform-admins',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [{ type: 'PlatformAdmin', id: 'LIST' }],
    }),

    updateTenantStatus: builder.mutation<
      { success: boolean; data: Record<string, unknown>; message?: string },
      { tenantKey: string; status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED'; reason?: string }
    >({
      query: ({ tenantKey, status, reason }) => ({
        url: `/platform/tenants/${encodeURIComponent(tenantKey)}/status`,
        method: 'PATCH',
        body: { status, reason },
      }),
      invalidatesTags: (_result, _error, { tenantKey }) => [
        { type: 'Tenant', id: tenantKey },
        { type: 'Tenant', id: 'LIST' },
        { type: 'Dashboard', id: 'PLATFORM' },
      ],
    }),
  }),
});

export const platformAdminApi = platformAdminApiSlice;

export const {
  useGetTenantsQuery,
  useListPlatformAdminsQuery,
  useCreateTenantMutation,
  useUpdateTenantMutation,
  useUpdateTenantStatusMutation,
  useResetSuperAdminPasswordMutation,
  useListSuperAdminsQuery,
  useLazyListSuperAdminsQuery,
  useCreateSuperAdminMutation,
  useUpdateSuperAdminMutation,
  useRegisterPlatformAdminMutation,
} = platformAdminApiSlice;
