import { apiSlice } from './api-slice';
import type {
  LoginResponse,
  RefreshResponse,
  AdminVerifyResponse,
  UserPrincipal,
} from '@/lib/auth-types';

export interface RegisterTenantSuperAdminPayload {
  tenantName: string;
  tenantKey?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  environment?: string;
  cloudProvider?: string;
  complianceFramework?: string;
}

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, { email: string; password: string }>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      invalidatesTags: ['User'],
    }),

    refresh: builder.mutation<RefreshResponse, { refreshToken?: string } | void>({
      query: (body) => ({
        url: '/auth/refresh',
        method: 'POST',
        body: body || {},
      }),
    }),

    logout: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
      invalidatesTags: ['User'],
    }),

    logoutAll: builder.mutation<{ message: string }, void>({
      query: () => ({
        url: '/auth/logout-all',
        method: 'POST',
      }),
      invalidatesTags: ['User'],
    }),

    registerTenantSuperAdmin: builder.mutation<
      { success: boolean; data: Record<string, unknown>; message: string },
      RegisterTenantSuperAdminPayload
    >({
      query: (payload) => ({
        url: '/auth/register-tenant-super-admin',
        method: 'POST',
        body: payload,
      }),
      invalidatesTags: ['Tenant', 'User'],
    }),

    getMe: builder.query<UserPrincipal, void>({
      query: () => ({
        url: '/auth/me',
        method: 'GET',
      }),
      providesTags: ['User'],
    }),

    verifyAdmin: builder.query<AdminVerifyResponse, void>({
      query: () => ({
        url: '/auth/admin/verify',
        method: 'GET',
      }),
    }),

    forgotPassword: builder.mutation<
      { success: boolean; message: string },
      { email: string; tenantKey?: string }
    >({
      query: (body) => ({
        url: '/auth/forgot-password',
        method: 'POST',
        body,
      }),
    }),

    resetPassword: builder.mutation<
      { success: boolean; message: string },
      { token: string; newPassword: string; tenantKey?: string }
    >({
      query: (body) => ({
        url: '/auth/reset-password',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const {
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
  useLogoutAllMutation,
  useRegisterTenantSuperAdminMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
  useVerifyAdminQuery,
  useForgotPasswordMutation,
  useResetPasswordMutation,
} = authApi;
