import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { UserPrincipal } from '@/lib/auth-types';
import { DIRECT_BACKEND_URL, isTrustedOrigin } from '@/lib/config';

function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

const prepareCommonHeaders = (headers: Headers, { getState }: { getState: () => unknown }) => {
  const state = getState() as { auth?: { accessToken?: string | null } } | undefined;
  const token =
    state?.auth?.accessToken ||
    (typeof window !== 'undefined'
      ? sessionStorage.getItem('vm_sec_access_token') || localStorage.getItem('vm_sec_access_token')
      : null);

  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  if (!headers.has('x-correlation-id')) {
    headers.set('x-correlation-id', generateCorrelationId());
  }

  return headers;
};

const primaryBaseQuery = fetchBaseQuery({
  baseUrl: '/backend-api',
  credentials: 'include',
  prepareHeaders: prepareCommonHeaders,
});

const directBaseQuery = fetchBaseQuery({
  baseUrl: `${DIRECT_BACKEND_URL}/api/v1`,
  credentials: 'include',
  prepareHeaders: prepareCommonHeaders,
});

let activeRefreshPromise: Promise<{ accessToken: string; expiresIn: number; user?: UserPrincipal } | null> | null = null;

/**
 * Common BaseQuery with Fallback URL, Reauth on 401, Mutex-Protected Token Rotation, and Correlation Propagation.
 * 1. Executes via Next.js rewrite (/backend-api).
 * 2. On network failure (FETCH_ERROR), falls back to DIRECT_BACKEND_URL/api/v1.
 * 3. On 401, deduplicates concurrent refresh requests using an in-flight promise mutex.
 * 4. If rotation fails, purges session and redirects to /login?expired=1.
 */
const baseQueryWithFallbackAndReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await primaryBaseQuery(args, api, extraOptions);

  // Fallback to direct backend if Next.js rewrite proxy experiences network failure (FETCH_ERROR) or gateway/proxy errors (502, 503, 504)
  const isProxyFailure =
    result.error &&
    (result.error.status === 'FETCH_ERROR' ||
      result.error.status === 502 ||
      result.error.status === 503 ||
      result.error.status === 504);

  if (isProxyFailure && isTrustedOrigin(DIRECT_BACKEND_URL)) {
    try {
      const fallbackResult = await directBaseQuery(args, api, extraOptions);
      if (!fallbackResult.error) {
        result = fallbackResult;
      }
    } catch {
      // Keep original result error
    }
  }

  // Determine path for 401 inspection
  const path = typeof args === 'string' ? args : args.url;
  const isAuthPath = path.startsWith('/auth/login') || path.startsWith('/auth/refresh');

  if (result.error && result.error.status === 401 && !isAuthPath) {
    if (!activeRefreshPromise) {
      activeRefreshPromise = (async () => {
        try {
          const refreshResult = await primaryBaseQuery(
            { url: '/auth/refresh', method: 'POST' },
            api,
            extraOptions
          );

          if (refreshResult.data) {
            const data = refreshResult.data as { accessToken: string; expiresIn: number; user?: UserPrincipal };
            const newToken = data.accessToken;
            let user = data.user;

            if (!user) {
              const meResult = await primaryBaseQuery(
                { url: '/auth/me', headers: { authorization: `Bearer ${newToken}` } },
                api,
                extraOptions
              );
              const meData = meResult.data as { user?: UserPrincipal } | UserPrincipal | undefined;
              if (meData && typeof meData === 'object') {
                user = 'user' in meData && meData.user ? meData.user : (meData as UserPrincipal);
              }
            }

            api.dispatch({
              type: 'auth/setAuthCredentials',
              payload: {
                accessToken: newToken,
                user: user || null,
                tenantKey: user?.tenantId || null,
                expiresAt: Date.now() + (data.expiresIn || 900) * 1000,
              },
            });

            return { accessToken: newToken, expiresIn: data.expiresIn, user };
          }
          return null;
        } catch {
          return null;
        } finally {
          activeRefreshPromise = null;
        }
      })();
    }

    const refreshData = await activeRefreshPromise;

    if (refreshData?.accessToken) {
      // Retry initial request with rotated token
      result = await primaryBaseQuery(args, api, extraOptions);
    } else {
      // Refresh failed: terminate session, purge store and redirect safely
      if (typeof window !== 'undefined') {
        localStorage.removeItem('vm_sec_access_token');
        localStorage.removeItem('vm_sec_user_principal');
        localStorage.removeItem('vm_sec_expires_at');
        sessionStorage.removeItem('vm_sec_access_token');
        sessionStorage.removeItem('vm_sec_user_principal');
        sessionStorage.removeItem('vm_sec_expires_at');

        if (!window.location.pathname.startsWith('/login')) {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = '/login?expired=1';
        }
      }
      api.dispatch({ type: 'auth/logoutStore' });
    }
  }

  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithFallbackAndReauth,
  tagTypes: [
    'Scan',
    'Finding',
    'Vulnerability',
    'Tenant',
    'Project',
    'User',
    'Dashboard',
    'Asset',
    'AuditLog',
    'Audit',
    'Integration',
    'PlatformAdmin',
    'Preference',
    'System',
  ],
  endpoints: () => ({}),
});
