import { apiSlice } from './api-slice';
import type { TenantUser } from '@/lib/types';

export interface CreateUserInput {
  email: string;
  password?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  employeeId?: string;
  department?: string;
  roles?: string[];
  assignedProjectIds?: string[];
}

export const usersApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query<{ success: boolean; data: TenantUser[] }, void>({
      query: () => '/tenant/users',
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'User' as const, id })),
              { type: 'User', id: 'LIST' },
            ]
          : [{ type: 'User', id: 'LIST' }],
    }),

    createUser: builder.mutation<
      { success: boolean; data: TenantUser; message?: string },
      CreateUserInput
    >({
      query: (body) => ({
        url: '/tenant/users',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'User', id: 'LIST' }],
    }),

    updateUserStatus: builder.mutation<
      { success: boolean; message: string },
      { userId: string; status: 'ACTIVE' | 'DISABLED' | 'SUSPENDED' }
    >({
      query: ({ userId, status }) => ({
        url: `/tenant/users/${encodeURIComponent(userId)}/status`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: (_result, _error, { userId }) => [
        { type: 'User', id: userId },
        { type: 'User', id: 'LIST' },
      ],
    }),

    // Backwards-compatible aliases
    getTenantUsers: builder.query<{ success: boolean; data: TenantUser[] }, void>({
      query: () => '/tenant/users',
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: 'User' as const, id })),
              { type: 'User', id: 'LIST' },
            ]
          : [{ type: 'User', id: 'LIST' }],
    }),

    createTenantUser: builder.mutation<
      { success: boolean; data: TenantUser; message?: string },
      CreateUserInput
    >({
      query: (body) => ({
        url: '/tenant/users',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'User', id: 'LIST' }],
    }),

    updateTenantUserStatus: builder.mutation<
      { success: boolean; message: string },
      { userId: string; status: 'ACTIVE' | 'DISABLED' | 'SUSPENDED' }
    >({
      query: ({ userId, status }) => ({
        url: `/tenant/users/${encodeURIComponent(userId)}/status`,
        method: 'PATCH',
        body: { status },
      }),
      invalidatesTags: (_result, _error, { userId }) => [
        { type: 'User', id: userId },
        { type: 'User', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useLazyGetUsersQuery,
  useCreateUserMutation,
  useUpdateUserStatusMutation,
  useGetTenantUsersQuery,
  useLazyGetTenantUsersQuery,
  useCreateTenantUserMutation,
  useUpdateTenantUserStatusMutation,
} = usersApi;
