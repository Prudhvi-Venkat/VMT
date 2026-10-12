import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { UserPrincipal, LoginResponse } from '@/lib/auth-types';
import type { NotificationPreferences } from '@/lib/types';
import { authApi } from '../api/auth-api';
import { preferencesApi } from '../api/preferences-api';
import type { RootState, AppDispatch } from '../index';

const TOKEN_KEY = 'vm_sec_access_token';
const USER_KEY = 'vm_sec_user_principal';
const EXPIRES_KEY = 'vm_sec_expires_at';

export interface AuthState {
  user: UserPrincipal | null;
  accessToken: string | null;
  expiresAt: number | null;
  tenantKey: string | null;
  isLoading: boolean;
  error: string | null;
  preferences: NotificationPreferences;
  prefsLoading: boolean;
  prefsSaving: boolean;
  prefsNotice: { type: 'success' | 'error'; text: string } | null;
}

const initialPreferences: NotificationPreferences = {
  emailOnCritical: true,
  emailOnScanComplete: true,
  emailOnSlaBreach: true,
};

const initialState: AuthState = {
  user: null,
  accessToken: null,
  expiresAt: null,
  tenantKey: null,
  isLoading: false,
  error: null,
  preferences: initialPreferences,
  prefsLoading: false,
  prefsSaving: false,
  prefsNotice: null,
};

// ─── Async Thunks ────────────────────────────────────────────────────────────

function persistSession(token: string, user: UserPrincipal, expiryTime: number) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(EXPIRES_KEY, expiryTime.toString());
  } catch {}
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  } catch {}
}

function clearSession() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(EXPIRES_KEY);
  } catch {}
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  } catch {}
}

export const loginThunk = createAsyncThunk<
  LoginResponse,
  { email: string; password: string },
  { dispatch: AppDispatch; rejectValue: string }
>('auth/login', async ({ email, password }, { dispatch, rejectWithValue }) => {
  try {
    const res = await dispatch(authApi.endpoints.login.initiate({ email, password })).unwrap();
    const expiryTime = Date.now() + res.expiresIn * 1000;
    persistSession(res.accessToken, res.user, expiryTime);
    return res;
  } catch (err: unknown) {
    const message =
      err && typeof err === 'object' && 'data' in err && (err as { data?: { error?: { message?: string }; message?: string } }).data
        ? (err as { data?: { error?: { message?: string }; message?: string } }).data?.error?.message ||
          (err as { data?: { error?: { message?: string }; message?: string } }).data?.message ||
          'Invalid credentials'
        : err instanceof Error
        ? err.message
        : 'Invalid credentials';
    return rejectWithValue(message);
  }
});

export const refreshThunk = createAsyncThunk<
  { accessToken: string; expiresIn: number; user: UserPrincipal },
  void,
  { state: RootState; dispatch: AppDispatch; rejectValue: string }
>('auth/refresh', async (_, { getState, dispatch, rejectWithValue }) => {
  try {
    const res = await dispatch(authApi.endpoints.refresh.initiate()).unwrap();
    const state = getState();
    const updatedUser = state.auth.user || (await dispatch(authApi.endpoints.getMe.initiate()).unwrap());
    const expiryTime = Date.now() + res.expiresIn * 1000;
    persistSession(res.accessToken, updatedUser, expiryTime);
    return { ...res, user: updatedUser };
  } catch (err: unknown) {
    clearSession();
    return rejectWithValue(err instanceof Error ? err.message : 'Session refresh failed');
  }
});

export const logoutThunk = createAsyncThunk<void, void, { state: RootState; dispatch: AppDispatch }>(
  'auth/logout',
  async (_, { getState, dispatch }) => {
    const state = getState();
    const token = state.auth.accessToken;
    if (token) {
      try {
        await dispatch(authApi.endpoints.logout.initiate()).unwrap();
      } catch {
        // ignore network error on logout
      }
    }
    clearSession();
    dispatch(logoutStore());
  }
);

export const logoutAllThunk = createAsyncThunk<void, void, { state: RootState; dispatch: AppDispatch }>(
  'auth/logoutAll',
  async (_, { getState, dispatch }) => {
    const state = getState();
    const token = state.auth.accessToken;
    if (token) {
      try {
        await dispatch(authApi.endpoints.logoutAll.initiate()).unwrap();
      } catch {
        // ignore network error on logout
      }
    }
    clearSession();
    dispatch(logoutStore());
  }
);

export const fetchPreferencesThunk = createAsyncThunk<
  NotificationPreferences,
  string | void,
  { dispatch: AppDispatch; rejectValue: string }
>('auth/fetchPreferences', async (_, { dispatch, rejectWithValue }) => {
  try {
    const res = await dispatch(preferencesApi.endpoints.getPreferences.initiate()).unwrap();
    if (res && res.notifications) {
      return {
        emailOnCritical: Boolean(res.notifications.emailOnCritical),
        emailOnScanComplete: Boolean(res.notifications.emailOnScanComplete),
        emailOnSlaBreach: Boolean(res.notifications.emailOnSlaBreach),
      };
    }
    return initialPreferences;
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : 'Failed to load preferences');
  }
});

export const updatePreferencesThunk = createAsyncThunk<
  NotificationPreferences,
  { preferences: NotificationPreferences; token?: string },
  { dispatch: AppDispatch; rejectValue: string }
>(
  'auth/updatePreferences',
  async ({ preferences }, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(
        preferencesApi.endpoints.updatePreferences.initiate({ preferences: { notifications: preferences } })
      ).unwrap();
      return preferences;
    } catch (err: unknown) {
      return rejectWithValue(err instanceof Error ? err.message : 'Failed to save preferences');
    }
  }
);

// ─── Slice Definition ────────────────────────────────────────────────────────

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthCredentials: (
      state,
      action: PayloadAction<{
        user: UserPrincipal | null;
        accessToken: string | null;
        tenantKey?: string | null;
        expiresAt?: number | null;
      }>
    ) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.tenantKey = action.payload.tenantKey || action.payload.user?.tenantId || null;
      if (action.payload.expiresAt !== undefined) {
        state.expiresAt = action.payload.expiresAt;
      }
      state.error = null;
      if (action.payload.accessToken && action.payload.user && action.payload.expiresAt) {
        persistSession(action.payload.accessToken, action.payload.user, action.payload.expiresAt);
      }
    },
    setAuthLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setAuthError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearAuthError: (state) => {
      state.error = null;
    },
    setLocalPreferences: (state, action: PayloadAction<NotificationPreferences>) => {
      state.preferences = action.payload;
    },
    clearPrefsNotice: (state) => {
      state.prefsNotice = null;
    },
    logoutStore: () => {
      clearSession();
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(loginThunk.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.isLoading = false;
        state.accessToken = action.payload.accessToken;
        state.user = action.payload.user;
        state.tenantKey = action.payload.user?.tenantId || null;
        state.expiresAt = Date.now() + action.payload.expiresIn * 1000;
        state.error = null;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || 'Login failed';
      })

      // Refresh
      .addCase(refreshThunk.fulfilled, (state, action) => {
        state.accessToken = action.payload.accessToken;
        state.user = action.payload.user;
        state.tenantKey = action.payload.user?.tenantId || null;
        state.expiresAt = Date.now() + action.payload.expiresIn * 1000;
      })
      .addCase(refreshThunk.rejected, (state) => {
        state.user = null;
        state.accessToken = null;
        state.expiresAt = null;
        state.tenantKey = null;
      })

      // Fetch Preferences
      .addCase(fetchPreferencesThunk.pending, (state) => {
        state.prefsLoading = true;
      })
      .addCase(fetchPreferencesThunk.fulfilled, (state, action) => {
        state.prefsLoading = false;
        state.preferences = action.payload;
      })
      .addCase(fetchPreferencesThunk.rejected, (state, action) => {
        state.prefsLoading = false;
        state.prefsNotice = {
          type: 'error',
          text: action.payload as string,
        };
      })

      // Update Preferences
      .addCase(updatePreferencesThunk.pending, (state) => {
        state.prefsSaving = true;
        state.prefsNotice = null;
      })
      .addCase(updatePreferencesThunk.fulfilled, (state, action) => {
        state.prefsSaving = false;
        state.preferences = action.payload;
        state.prefsNotice = { type: 'success', text: 'Notification preferences saved.' };
      })
      .addCase(updatePreferencesThunk.rejected, (state, action) => {
        state.prefsSaving = false;
        state.prefsNotice = { type: 'error', text: action.payload as string };
      });
  },
});

export const {
  setAuthCredentials,
  setAuthLoading,
  setAuthError,
  clearAuthError,
  setLocalPreferences,
  clearPrefsNotice,
  logoutStore,
} = authSlice.actions;

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectAuthUser = (state: RootState) => state.auth.user;
export const selectAccessToken = (state: RootState) => state.auth.accessToken;
export const selectExpiresAt = (state: RootState) => state.auth.expiresAt;
export const selectTenantKey = (state: RootState) => state.auth.tenantKey;
export const selectAuthIsLoading = (state: RootState) => state.auth.isLoading;
export const selectAuthError = (state: RootState) => state.auth.error;
export const selectUserPreferences = (state: RootState) => state.auth.preferences;
export const selectPrefsLoading = (state: RootState) => state.auth.prefsLoading;
export const selectPrefsSaving = (state: RootState) => state.auth.prefsSaving;
export const selectPrefsNotice = (state: RootState) => state.auth.prefsNotice;

export default authSlice.reducer;
