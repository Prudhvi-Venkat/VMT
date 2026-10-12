import { apiSlice } from './api-slice';
import type { BackendHealthResponse } from '@/lib/auth-types';
import { DIRECT_BACKEND_URL } from '@/lib/config';

export const systemApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    checkHealth: builder.query<BackendHealthResponse, void>({
      queryFn: async () => {
        // Try the dedicated Next.js rewrite route first (/backend-health -> :backend/health)
        try {
          const res = await fetch('/backend-health');
          if (res.ok) {
            const data = (await res.json()) as BackendHealthResponse;
            return { data };
          }
        } catch {
          // Network error or SSR, fall back to direct backend URL
        }

        // Direct backend health endpoint fallback (/health)
        try {
          const directRes = await fetch(`${DIRECT_BACKEND_URL}/health`);
          if (directRes.ok) {
            const data = (await directRes.json()) as BackendHealthResponse;
            return { data };
          }
          return {
            error: {
              status: directRes.status,
              data: `Backend health check returned ${directRes.status}`,
            },
          };
        } catch (err) {
          return {
            error: {
              status: 'FETCH_ERROR',
              error: err instanceof Error ? err.message : String(err),
            },
          };
        }
      },
      providesTags: ['System'],
    }),
  }),
});

export const { useCheckHealthQuery, useLazyCheckHealthQuery } = systemApi;
