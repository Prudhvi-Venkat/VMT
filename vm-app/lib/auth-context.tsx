"use client";

import React, { createContext, useContext, useEffect, useCallback } from "react";
import type {
  AuthContextType,
  UserPrincipal,
  AdminVerifyResponse,
} from "./auth-types";
import { authApi } from "./store/api/auth-api";
import { useAppDispatch, useAppSelector } from "./store/hooks";
import {
  selectAuthUser,
  selectAccessToken,
  selectExpiresAt,
  selectAuthIsLoading,
  selectAuthError,
  loginThunk,
  refreshThunk,
  logoutThunk,
  logoutAllThunk,
  setAuthCredentials,
  clearAuthError,
  setAuthLoading,
} from "./store/slices/auth-slice";

const TOKEN_KEY = "vm_sec_access_token";
const USER_KEY = "vm_sec_user_principal";
const EXPIRES_KEY = "vm_sec_expires_at";

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * AuthProvider facade over Redux Auth State (Phase R3).
 * Redux auth slice is the single authoritative source of truth.
 * This facade preserves backwards-compatibility for all existing useAuth() callers.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();

  const user = useAppSelector(selectAuthUser);
  const accessToken = useAppSelector(selectAccessToken);
  const expiresAt = useAppSelector(selectExpiresAt);
  const isLoading = useAppSelector(selectAuthIsLoading);
  const error = useAppSelector(selectAuthError);

  // Hydrate session on app mount into Redux
  useEffect(() => {
    async function hydrate() {
      if (typeof window === "undefined") return;

      // Prefer sessionStorage (hardened tab-isolated storage)
      let storedToken: string | null = null;
      let storedUser: string | null = null;
      let storedExpiry: string | null = null;

      try {
        storedToken = sessionStorage.getItem(TOKEN_KEY);
        storedUser = sessionStorage.getItem(USER_KEY);
        storedExpiry = sessionStorage.getItem(EXPIRES_KEY);
      } catch {}

      // Fallback: check legacy localStorage and migrate
      if (!storedToken || !storedUser || !storedExpiry) {
        try {
          const legacyToken = localStorage.getItem(TOKEN_KEY);
          const legacyUser = localStorage.getItem(USER_KEY);
          const legacyExpiry = localStorage.getItem(EXPIRES_KEY);
          if (legacyToken && legacyUser && legacyExpiry) {
            storedToken = legacyToken;
            storedUser = legacyUser;
            storedExpiry = legacyExpiry;
            sessionStorage.setItem(TOKEN_KEY, legacyToken);
            sessionStorage.setItem(USER_KEY, legacyUser);
            sessionStorage.setItem(EXPIRES_KEY, legacyExpiry);
          }
        } catch {}
      }

      // Clean up any residual tokens in localStorage
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(EXPIRES_KEY);
      } catch {}

      if (storedToken && storedUser && storedExpiry) {
        try {
          const parsedUser: UserPrincipal = JSON.parse(storedUser);
          const parsedExpiry = parseInt(storedExpiry, 10);

          if (Date.now() < parsedExpiry - 30000) {
            dispatch(
              setAuthCredentials({
                user: parsedUser,
                accessToken: storedToken,
                tenantKey: parsedUser.tenantId,
                expiresAt: parsedExpiry,
              })
            );
          } else {
            // Token expired or near expiry: trigger rotation via thunk
            dispatch(refreshThunk());
          }
        } catch {
          // Bad session format
        }
      }
      dispatch(setAuthLoading(false));
    }

    hydrate();
  }, [dispatch]);

  // Proactive Session Expiry Timer
  useEffect(() => {
    if (!expiresAt || !user || !accessToken) return;
    const timeRemaining = expiresAt - Date.now();
    const timer = setTimeout(() => {
      dispatch(logoutThunk());
    }, Math.max(0, timeRemaining));
    return () => clearTimeout(timer);
  }, [expiresAt, user, accessToken, dispatch]);

  const login = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      try {
        await dispatch(loginThunk({ email, password })).unwrap();
        return true;
      } catch {
        return false;
      }
    },
    [dispatch]
  );

  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      await dispatch(refreshThunk()).unwrap();
      return true;
    } catch {
      return false;
    }
  }, [dispatch]);

  const logout = useCallback(async (): Promise<void> => {
    await dispatch(logoutThunk()).unwrap();
  }, [dispatch]);

  const logoutAll = useCallback(async (): Promise<void> => {
    await dispatch(logoutAllThunk()).unwrap();
  }, [dispatch]);

  const verifyAdmin = useCallback(async (): Promise<AdminVerifyResponse | null> => {
    if (!accessToken) return null;
    try {
      const res = await dispatch(authApi.endpoints.verifyAdmin.initiate()).unwrap();
      return res;
    } catch {
      return null;
    }
  }, [accessToken, dispatch]);

  const clearError = useCallback(() => {
    dispatch(clearAuthError());
  }, [dispatch]);

  const isAuthenticated = Boolean(user && accessToken && expiresAt);
  const isPlatformAdmin = Boolean(
    isAuthenticated && user?.roles && user.roles.includes("PLATFORM_ADMIN")
  );
  const isTenantSuperAdmin = Boolean(
    isAuthenticated && user?.roles && user.roles.includes("TENANT_SUPER_ADMIN")
  );
  const isTenantAdmin = Boolean(
    isAuthenticated && user?.roles && user.roles.includes("TENANT_ADMIN")
  );
  const isEndUser = Boolean(
    isAuthenticated && user?.roles && user.roles.includes("END_USER")
  );
  const isSecurityManager = Boolean(
    isAuthenticated && user?.roles && user.roles.includes("SECURITY_MANAGER")
  );
  const hasRole = useCallback(
    (role: string) => {
      if (!isAuthenticated || !role) return false;
      return Boolean(user?.roles?.includes(role));
    },
    [isAuthenticated, user?.roles]
  );
  const hasPermission = useCallback(
    (permission: string) => {
      if (!isAuthenticated || !permission) return false;
      const permissions = user?.permissions || [];
      return (
        permissions.includes("*") ||
        (permissions.includes("platform:*") && (permission.startsWith("platform:") || permission === "*")) ||
        permissions.includes(permission)
      );
    },
    [isAuthenticated, user?.permissions]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated,
        isPlatformAdmin,
        isTenantSuperAdmin,
        isTenantAdmin,
        isEndUser,
        isSecurityManager,
        isLoading,
        expiresAt,
        error,
        login,
        logout,
        logoutAll,
        refreshToken,
        verifyAdmin,
        clearError,
        hasPermission,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
