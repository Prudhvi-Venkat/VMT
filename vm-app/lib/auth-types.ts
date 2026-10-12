export type UserStatus = "ACTIVE" | "INACTIVE" | "LOCKED";
export type UserScope = "platform" | "tenant";

export interface UserPrincipal {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  roles: string[];
  status: UserStatus;
  scope: UserScope;
  tenantId?: string;
  permissions?: string[];
  mustChangePassword?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn: number;
  user: UserPrincipal;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn: number;
}

export interface AdminVerifyResponse {
  status: "AUTHORIZED" | "FORBIDDEN" | string;
  message: string;
  principal: {
    userId: string;
    scope: string;
    roles: string[];
  };
}

export interface BackendHealthResponse {
  status: "HEALTHY" | "DEGRADED" | "OFFLINE" | string;
  timestamp: string;
}

export interface AuthErrorDetail {
  code: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

export interface AuthContextType {
  user: UserPrincipal | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  isTenantSuperAdmin: boolean;
  isTenantAdmin: boolean;
  isEndUser: boolean;
  isSecurityManager: boolean;
  isLoading: boolean;
  expiresAt: number | null;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  verifyAdmin: () => Promise<AdminVerifyResponse | null>;
  clearError: () => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

export interface SecurityAuditEvent {
  id: string;
  timestamp: string;
  action: string;
  actor: {
    userId?: string;
    roles?: string[];
    ip?: string;
    userAgent?: string;
  };
  status: "SUCCESS" | "FAILED" | "WARNING" | "INFO";
  details?: Record<string, unknown>;
  correlationId?: string;
}
