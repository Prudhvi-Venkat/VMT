import { apiSlice } from './api-slice';
import type { TenantIntegration } from '@/lib/types';

export interface CreateIntegrationInput {
  type: string;
  name: string;
  projectId?: string;
  credentials: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface TriggerIntegrationScanInput {
  id: string;
  repositoryId: string;
  projectId?: string;
  branch?: string;
  manifestPath?: string;
}

export const integrationsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getIntegrations: builder.query<{ success: boolean; data: TenantIntegration[] }, void>({
      query: () => '/integrations',
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'Integration' as const, id })),
              { type: 'Integration', id: 'LIST' },
            ]
          : [{ type: 'Integration', id: 'LIST' }],
    }),

    createIntegration: builder.mutation<
      { success: boolean; data: TenantIntegration; message?: string },
      CreateIntegrationInput
    >({
      query: (body) => ({
        url: '/integrations',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Integration', id: 'LIST' }],
    }),

    testIntegration: builder.mutation<
      { success: boolean; message: string; data?: Record<string, unknown> },
      string
    >({
      query: (id) => ({
        url: `/integrations/${encodeURIComponent(id)}/test`,
        method: 'POST',
      }),
    }),

    getIntegrationRepositories: builder.query<
      { success: boolean; data: Array<{ id: string; name: string; fullName: string; defaultBranch: string }> },
      string
    >({
      query: (id) => `/integrations/${encodeURIComponent(id)}/repositories`,
    }),

    triggerScan: builder.mutation<
      { success: boolean; message: string; scanId?: string; data?: Record<string, unknown> },
      TriggerIntegrationScanInput
    >({
      query: ({ id, repositoryId, ...body }) => ({
        url: `/integrations/${encodeURIComponent(id)}/repositories/${encodeURIComponent(repositoryId)}/scan`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Scan'],
    }),

    // Backwards-compatible aliases
    getTenantIntegrations: builder.query<{ success: boolean; data: TenantIntegration[] }, void>({
      query: () => '/integrations',
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'Integration' as const, id })),
              { type: 'Integration', id: 'LIST' },
            ]
          : [{ type: 'Integration', id: 'LIST' }],
    }),

    createTenantIntegration: builder.mutation<
      { success: boolean; data: TenantIntegration; message?: string },
      CreateIntegrationInput
    >({
      query: (body) => ({
        url: '/integrations',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Integration', id: 'LIST' }],
    }),

    testTenantIntegration: builder.mutation<
      { success: boolean; message: string; data?: Record<string, unknown> },
      string
    >({
      query: (id) => ({
        url: `/integrations/${encodeURIComponent(id)}/test`,
        method: 'POST',
      }),
    }),

    deleteIntegration: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({
        url: `/integrations/${encodeURIComponent(id)}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Integration', id: 'LIST' }],
    }),

    deleteTenantIntegration: builder.mutation<{ success: boolean; message: string }, string>({
      query: (id) => ({
        url: `/integrations/${encodeURIComponent(id)}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Integration', id: 'LIST' }],
    }),

    triggerTenantScan: builder.mutation<
      { success: boolean; message: string; scanId?: string; data?: Record<string, unknown> },
      TriggerIntegrationScanInput
    >({
      query: ({ id, repositoryId, ...body }) => ({
        url: `/integrations/${encodeURIComponent(id)}/repositories/${encodeURIComponent(repositoryId)}/scan`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Scan'],
    }),
  }),
});

export const {
  useGetIntegrationsQuery,
  useLazyGetIntegrationsQuery,
  useCreateIntegrationMutation,
  useTestIntegrationMutation,
  useDeleteIntegrationMutation,
  useGetIntegrationRepositoriesQuery,
  useTriggerScanMutation,
  useGetTenantIntegrationsQuery,
  useLazyGetTenantIntegrationsQuery,
  useCreateTenantIntegrationMutation,
  useTestTenantIntegrationMutation,
  useDeleteTenantIntegrationMutation,
  useTriggerTenantScanMutation,
} = integrationsApi;
