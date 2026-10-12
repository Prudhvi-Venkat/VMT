import { apiSlice } from './api-slice';
import type { TenantProject } from '@/lib/types';

export interface CreateProjectInput {
  name: string;
  key?: string;
  description?: string;
  department?: string;
  businessUnit?: string;
  applicationName?: string;
  startDate?: string;
  endDate?: string;
  stage?: string;
  cloudProvider?: string;
  cloudMetadata?: Record<string, unknown>;
  assignedUserIds?: string[];
  initialRole?: string;
  riskProfile?: string;
}

export const projectsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getProjects: builder.query<{ success: boolean; data: TenantProject[] }, void>({
      query: () => '/tenant/projects',
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'Project' as const, id })),
              { type: 'Project', id: 'LIST' },
            ]
          : [{ type: 'Project', id: 'LIST' }],
    }),

    createProject: builder.mutation<
      { success: boolean; data: TenantProject; message?: string },
      CreateProjectInput
    >({
      query: (body) => ({
        url: '/tenant/projects',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Project', id: 'LIST' }],
    }),

    updateProjectStatus: builder.mutation<
      { success: boolean; data: TenantProject; message?: string },
      { id?: string; projectId?: string; status: string }
    >({
      query: ({ id, projectId, status }) => {
        const targetId = id || projectId || '';
        return {
          url: `/tenant/projects/${targetId}/status`,
          method: 'PATCH',
          body: { status },
        };
      },
      invalidatesTags: (_result, _error, { id, projectId }) => [
        { type: 'Project', id: id || projectId },
        { type: 'Project', id: 'LIST' },
      ],
    }),

    assignProjectMember: builder.mutation<
      { success: boolean; data: TenantProject; message?: string },
      { id?: string; projectId?: string; userId: string; role?: string }
    >({
      query: ({ id, projectId, userId, role }) => {
        const targetId = id || projectId || '';
        return {
          url: `/tenant/projects/${targetId}/members`,
          method: 'POST',
          body: { userId, role },
        };
      },
      invalidatesTags: (_result, _error, { id, projectId }) => [
        { type: 'Project', id: id || projectId },
        { type: 'Project', id: 'LIST' },
      ],
    }),

    // Backwards-compatible aliases
    getTenantProjects: builder.query<{ success: boolean; data: TenantProject[] }, void>({
      query: () => '/tenant/projects',
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'Project' as const, id })),
              { type: 'Project', id: 'LIST' },
            ]
          : [{ type: 'Project', id: 'LIST' }],
    }),

    createTenantProject: builder.mutation<
      { success: boolean; data: TenantProject; message?: string },
      CreateProjectInput
    >({
      query: (body) => ({
        url: '/tenant/projects',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Project', id: 'LIST' }],
    }),

    updateTenantProjectStatus: builder.mutation<
      { success: boolean; data: TenantProject; message?: string },
      { id?: string; projectId?: string; status: string }
    >({
      query: ({ id, projectId, status }) => {
        const targetId = id || projectId || '';
        return {
          url: `/tenant/projects/${targetId}/status`,
          method: 'PATCH',
          body: { status },
        };
      },
      invalidatesTags: (_result, _error, { id, projectId }) => [
        { type: 'Project', id: id || projectId },
        { type: 'Project', id: 'LIST' },
      ],
    }),

    assignTenantProjectMember: builder.mutation<
      { success: boolean; data: TenantProject; message?: string },
      { id?: string; projectId?: string; userId: string; role?: string }
    >({
      query: ({ id, projectId, userId, role }) => {
        const targetId = id || projectId || '';
        return {
          url: `/tenant/projects/${targetId}/members`,
          method: 'POST',
          body: { userId, role },
        };
      },
      invalidatesTags: (_result, _error, { id, projectId }) => [
        { type: 'Project', id: id || projectId },
        { type: 'Project', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetProjectsQuery,
  useLazyGetProjectsQuery,
  useCreateProjectMutation,
  useUpdateProjectStatusMutation,
  useAssignProjectMemberMutation,
  useGetTenantProjectsQuery,
  useLazyGetTenantProjectsQuery,
  useCreateTenantProjectMutation,
  useUpdateTenantProjectStatusMutation,
  useAssignTenantProjectMemberMutation,
} = projectsApi;
