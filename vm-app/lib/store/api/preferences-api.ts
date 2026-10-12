import { apiSlice } from './api-slice';
import type { NotificationPreferences } from '@/lib/types';

export interface PreferencesResponse {
  notifications: NotificationPreferences;
}

export const preferencesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPreferences: builder.query<PreferencesResponse, void>({
      query: () => ({
        url: '/auth/preferences',
        method: 'GET',
      }),
      transformResponse: (response: { success?: boolean; data?: { notifications?: NotificationPreferences } }) => {
        return {
          notifications: response?.data?.notifications || {
            emailOnCritical: true,
            emailOnScanComplete: true,
            emailOnSlaBreach: false,
          },
        };
      },
      providesTags: ['Preference'],
    }),
    updatePreferences: builder.mutation<
      { success: boolean; message?: string },
      { preferences: { notifications: NotificationPreferences } }
    >({
      query: (body) => ({
        url: '/auth/preferences',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Preference'],
    }),
    changePassword: builder.mutation<
      { success: boolean; message?: string },
      { currentPassword: string; newPassword: string }
    >({
      query: (body) => ({
        url: '/auth/change-password',
        method: 'POST',
        body,
      }),
    }),
  }),
});

export const {
  useGetPreferencesQuery,
  useUpdatePreferencesMutation,
  useChangePasswordMutation,
} = preferencesApi;
