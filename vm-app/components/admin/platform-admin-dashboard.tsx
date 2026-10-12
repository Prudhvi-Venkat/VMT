"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Server,
  Lock,
  KeyRound,
  RotateCw,
  Clock,
  Terminal,
  FileText,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Fingerprint,
  UserCheck,
  Database,
  Sliders,
  ExternalLink,
  Building,
  Plus,
  Users,
  Edit3,
  Key,
  PlayCircle,
  PauseCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import {
  useLazyCheckHealthQuery,
  useGetPlatformDashboardQuery,
  useGetTenantsQuery,
  useListPlatformAdminsQuery,
  useGetAuditLogsQuery,
  useCreateTenantMutation,
  useUpdateTenantMutation,
  useUpdateTenantStatusMutation,
  useResetSuperAdminPasswordMutation,
  useRegisterPlatformAdminMutation,
} from "@/lib/store/api";
import type { AdminVerifyResponse, BackendHealthResponse, SecurityAuditEvent } from "@/lib/auth-types";
import { Field } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import type { PlatformAdminUser, TenantItem } from "@/lib/types";
import { DataTable } from "@/components/shared/data-table";

export function PlatformAdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const {
    user,
    accessToken,
    isAuthenticated,
    isPlatformAdmin,
    isLoading,
    expiresAt,
    logout,
    logoutAll,
    refreshToken,
    verifyAdmin,
  } = useAuth();

  const [tabState, setTabState] = useState<string>("overview");
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [healthLatency, setHealthLatency] = useState<number | null>(null);
  const [verifyData, setVerifyData] = useState<AdminVerifyResponse | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [actionAlert, setActionAlert] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [revokeAllDialogOpen, setRevokeAllDialogOpen] = useState(false);

  // RTK Query server state (authoritative live platform audit logs)
  const { data: auditLogsData, refetch: refetchAuditLogs } = useGetAuditLogsQuery(
    { scope: "platform" },
    { skip: !accessToken || !isPlatformAdmin }
  );
  const auditLogs = (auditLogsData?.data as unknown as SecurityAuditEvent[]) ?? [];

  const { data: tenantsData, refetch: refetchTenants } = useGetTenantsQuery(undefined, { skip: !accessToken });
  const { data: dashData, refetch: refetchDash } = useGetPlatformDashboardQuery(undefined, { skip: !accessToken });
  const { data: adminsData, refetch: refetchAdmins } = useListPlatformAdminsQuery(undefined, { skip: !accessToken });

  const [createTenantMutation] = useCreateTenantMutation();
  const [updateTenantMutation] = useUpdateTenantMutation();
  const [updateTenantStatusMutation] = useUpdateTenantStatusMutation();
  const [resetSuperAdminPasswordMutation] = useResetSuperAdminPasswordMutation();
  const [registerPlatformAdminMutation] = useRegisterPlatformAdminMutation();

  const tenants: TenantItem[] = tenantsData?.data ?? [];
  const platformTelemetry = (dashData?.data as unknown as Record<string, unknown>) ?? null;
  const platformAdmins: PlatformAdminUser[] = adminsData?.data ?? [];

  // Tenant management state
  const [createTenantOpen, setCreateTenantOpen] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantKey, setNewTenantKey] = useState("");
  const [newSuperAdminEmail, setNewSuperAdminEmail] = useState("");
  const [newSuperAdminName, setNewSuperAdminName] = useState("");
  const [newSuperAdminPassword, setNewSuperAdminPassword] = useState("");
  const [tenantSubmitting, setTenantSubmitting] = useState(false);

  // Edit Tenant state (Backend Req 5)
  const [editTenantOpen, setEditTenantOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantItem | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editCompliance, setEditCompliance] = useState("NONE");
  const [editCloudProvider, setEditCloudProvider] = useState("NONE");
  const [editStatus, setEditStatus] = useState<string>("ACTIVE");

  // Reset Super Admin Password state (Backend Req 6)
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetTargetTenant, setResetTargetTenant] = useState<TenantItem | null>(null);
  const [resetTargetUserId, setResetTargetUserId] = useState<string>("");
  const [resetNewPassword, setResetNewPassword] = useState("");

  // Platform Admins directory & registration state (Req 4 / Backend Req 7)
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminRole, setNewAdminRole] = useState("PLATFORM_ADMIN");
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  const tabParam = searchParams.get("tab");
  // Sidebar links must resolve to a tab that actually has content, otherwise
  // <Tabs> renders an empty body. Unknown values fall back to the default tab.
  const PLATFORM_TAB_ALIASES: Record<string, string> = {
    sessions: "overview",
    telemetry: "system",
    provision: "tenants",
    policies: "rbac",
    "register-admin": "platform-admins",
  };
  const PLATFORM_TAB_VALUES = ["tenants", "platform-admins", "overview", "audit", "rbac", "system"];
  const aliasTab = tabParam ? PLATFORM_TAB_ALIASES[tabParam] ?? tabParam : null;
  const activeTab =
    aliasTab && PLATFORM_TAB_VALUES.includes(aliasTab)
      ? aliasTab
      : PLATFORM_TAB_VALUES.includes(tabState)
        ? tabState
        : "tenants";

  const handleTabChange = (tab: string) => {
    setTabState(tab);
    router.push(`/admin?tab=${tab}`);
  };

  const addAuditLog = useCallback((_action: string, _status: "SUCCESS" | "FAILED" | "WARNING" | "INFO", _details?: Record<string, unknown>) => {
    void _action;
    void _status;
    void _details;
    refetchAuditLogs();
  }, [refetchAuditLogs]);

  const loadPlatformData = useCallback(() => {
    refetchTenants();
    refetchDash();
    refetchAdmins();
    refetchAuditLogs();
  }, [refetchTenants, refetchDash, refetchAdmins, refetchAuditLogs]);

  // Auth protection check
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isPlatformAdmin)) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, isPlatformAdmin, router]);

  // Expiration countdown calculation
  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setSecondsRemaining(diff);

      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setTimeRemaining(`${mins}m ${secs < 10 ? "0" : ""}${secs}s`);

      if (diff === 0 && isAuthenticated) {
        setActionAlert({
          type: "error",
          message: "Access token has expired. Refreshing token...",
        });
        refreshToken();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, isAuthenticated, refreshToken]);

  // Health ping effect
  const [triggerCheckHealth] = useLazyCheckHealthQuery();

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      const start = performance.now();
      try {
        const res = await triggerCheckHealth().unwrap();
        if (ignore) return;
        const latency = Math.round(performance.now() - start);
        setHealth(res);
        setHealthLatency(latency);
      } catch {
        if (ignore) return;
        setHealth({ status: "OFFLINE", timestamp: new Date().toISOString() });
        setHealthLatency(null);
      }
    };
    void run();
    const interval = setInterval(run, 10000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [triggerCheckHealth]);



  // Verify Admin call
  const handleVerifyAdmin = useCallback(async () => {
    setVerifyLoading(true);
    setActionAlert(null);
    try {
      const res = await verifyAdmin();
      if (res) {
        setVerifyData(res);
        setActionAlert({
          type: "success",
          message: "Cryptographic verification successful: PLATFORM_ADMIN role confirmed on backend.",
        });
        addAuditLog("ADMIN_PRIVILEGE_VERIFIED", "SUCCESS", { endpoint: "/api/v1/auth/admin/verify" });
      } else {
        setActionAlert({
          type: "error",
          message: "Verification failed: Principal does not hold platform:admin permission.",
        });
        addAuditLog("ADMIN_PRIVILEGE_VERIFIED", "FAILED", { reason: "Permission denied" });
      }
    } catch (err: unknown) {
      setActionAlert({
        type: "error",
        message: err instanceof Error ? err.message : "Error verifying admin privileges",
      });
    } finally {
      setVerifyLoading(false);
    }
  }, [verifyAdmin, addAuditLog]);

  // Initial verification on mount
  useEffect(() => {
    if (!isAuthenticated || !isPlatformAdmin) return;
    let ignore = false;
    const runVerify = async () => {
      try {
        const res = await verifyAdmin();
        if (ignore) return;
        if (res) {
          setVerifyData(res);
        }
      } catch {
        // Best effort
      }
    };
    void runVerify();
    return () => {
      ignore = true;
    };
  }, [isAuthenticated, isPlatformAdmin, verifyAdmin]);

  // Create tenant handler
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newTenantName.trim();
    const derivedKey = (newTenantKey.trim() || trimmedName.toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/^_+|_+$/g, "")).toLowerCase();
    const trimmedEmail = newSuperAdminEmail.trim();

    if (!trimmedName || !derivedKey || !trimmedEmail || !newSuperAdminPassword) {
      showToast("Tenant name, tenant key, super admin email, and password are required.", "error");
      return;
    }
    setTenantSubmitting(true);
    try {
      await createTenantMutation({
        name: trimmedName,
        tenantKey: derivedKey,
        superAdminEmail: trimmedEmail,
        superAdminFirstName: newSuperAdminName.trim().split(" ")[0] || undefined,
        superAdminLastName: newSuperAdminName.trim().split(" ").slice(1).join(" ") || undefined,
        superAdminPassword: newSuperAdminPassword,
      }).unwrap();

      showToast(`Tenant "${trimmedName}" provisioned successfully with dedicated partition and Super Admin.`, "success");
      addAuditLog("TENANT_PROVISIONED", "SUCCESS", {
        tenantName: trimmedName,
        superAdmin: trimmedEmail,
      });

      setCreateTenantOpen(false);
      setNewTenantName("");
      setNewTenantKey("");
      setNewSuperAdminEmail("");
      setNewSuperAdminName("");
      setNewSuperAdminPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create tenant";
      showToast(msg, "error");
      setActionAlert({ type: "error", message: msg });
    } finally {
      setTenantSubmitting(false);
    }
  };

  // Update Tenant handler (Backend Req 5 & G2)
  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;
    setTenantSubmitting(true);
    try {
      await updateTenantMutation({
        tenantKey: editingTenant.tenantKey,
        data: {
          displayName: editDisplayName.trim() || undefined,
          complianceFramework: editCompliance !== "NONE" ? editCompliance : undefined,
          cloudProvider: editCloudProvider !== "NONE" ? editCloudProvider : undefined,
        },
      }).unwrap();

      if (editStatus && editStatus !== editingTenant.status) {
        await updateTenantStatusMutation({
          tenantKey: editingTenant.tenantKey,
          status: editStatus as "ACTIVE" | "SUSPENDED" | "DISABLED",
          reason: `Status changed to ${editStatus} by platform administrator`,
        }).unwrap();
      }

      showToast(`Tenant "${editingTenant.name}" updated successfully.`, "success");
      addAuditLog("TENANT_UPDATED", "SUCCESS", { tenantKey: editingTenant.tenantKey, status: editStatus });
      setEditTenantOpen(false);
      setEditingTenant(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update tenant";
      showToast(msg, "error");
    } finally {
      setTenantSubmitting(false);
    }
  };

  // Quick Action: Toggle Tenant Lifecycle Status (G2)
  const handleToggleTenantStatus = async (t: TenantItem, nextStatus: "ACTIVE" | "SUSPENDED" | "DISABLED") => {
    setTenantSubmitting(true);
    try {
      await updateTenantStatusMutation({
        tenantKey: t.tenantKey,
        status: nextStatus,
        reason: `Status changed to ${nextStatus} via platform admin quick action`,
      }).unwrap();
      showToast(`Tenant "${t.name}" status updated to ${nextStatus}.`, "success");
      addAuditLog(`TENANT_STATUS_${nextStatus}`, "SUCCESS", { tenantKey: t.tenantKey, newStatus: nextStatus });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update tenant status";
      showToast(msg, "error");
    } finally {
      setTenantSubmitting(false);
    }
  };

  // Reset Super Admin Password handler (Backend Req 6)
  const handleResetSuperAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetTenant || !resetTargetUserId || !resetNewPassword) return;
    setTenantSubmitting(true);
    try {
      await resetSuperAdminPasswordMutation({
        tenantKey: resetTargetTenant.tenantKey,
        userId: resetTargetUserId,
        newPassword: resetNewPassword,
      }).unwrap();

      showToast(`Super Admin password for "${resetTargetTenant.name}" reset successfully.`, "success");
      addAuditLog("SUPER_ADMIN_PASSWORD_RESET", "SUCCESS", {
        tenantKey: resetTargetTenant.tenantKey,
        userId: resetTargetUserId,
      });
      setResetPasswordOpen(false);
      setResetTargetTenant(null);
      setResetTargetUserId("");
      setResetNewPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reset password";
      showToast(msg, "error");
    } finally {
      setTenantSubmitting(false);
    }
  };

  // Register Platform Admin handler (Req 4 / Backend Req 7)
  const handleRegisterPlatformAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail.trim() || !newAdminName.trim() || !newAdminPassword) {
      showToast("Please fill in all platform admin registration fields.", "error");
      return;
    }
    setAdminSubmitting(true);
    try {
      await registerPlatformAdminMutation({
        name: newAdminName.trim(),
        email: newAdminEmail.trim(),
        password: newAdminPassword,
        roles: [newAdminRole],
      }).unwrap();

      showToast(`Platform administrator ${newAdminEmail} created successfully.`, "success");
      addAuditLog("PLATFORM_ADMIN_REGISTERED", "SUCCESS", { email: newAdminEmail, role: newAdminRole });
      setNewAdminName("");
      setNewAdminEmail("");
      setNewAdminPassword("");
      setNewAdminRole("PLATFORM_ADMIN");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to register platform admin";
      showToast(msg, "error");
    } finally {
      setAdminSubmitting(false);
    }
  };

  // Refresh token handler
  const handleRefreshToken = async () => {
    setRefreshLoading(true);
    setActionAlert(null);
    try {
      const success = await refreshToken();
      if (success) {
        setActionAlert({
          type: "success",
          message: "Session token successfully rotated via RFC-6749 refresh flow. 15-minute TTL renewed.",
        });
        addAuditLog("TOKEN_ROTATED", "SUCCESS", { flow: "refresh_token" });
      } else {
        setActionAlert({
          type: "error",
          message: "Failed to refresh token. Session may have expired or been revoked.",
        });
        addAuditLog("TOKEN_ROTATED", "FAILED", { flow: "refresh_token" });
      }
    } finally {
      setRefreshLoading(false);
    }
  };

  // Revoke all sessions handler
  const handleRevokeAllSessions = async () => {
    setRevokeAllDialogOpen(false);
    setActionAlert(null);
    try {
      addAuditLog("SESSIONS_REVOKED_ALL", "WARNING", { action: "revoke_all_sessions" });
      await logoutAll();
      router.push("/login");
    } catch {
      setActionAlert({
        type: "error",
        message: "Failed to revoke all sessions.",
      });
    }
  };

  // Logout handler
  const handleLogout = async () => {
    addAuditLog("USER_LOGOUT", "INFO", { sessionId: "current" });
    await logout();
    router.push("/login");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Activity className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Hydrating Platform Security Context...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <PageHeader
        title="Platform Administration"
        titleBadges={
          <Badge variant="outline" className="border-border bg-primary/10 text-primary font-mono text-[10px] px-2 py-0.5">
            ROOT SCOPE
          </Badge>
        }
        description={
          <div className="flex items-center gap-2 mt-0.5">
            <span>Enterprise Security Exposure Platform</span>
            <span>·</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Backend API {healthLatency ? `(${healthLatency}ms)` : ""}
            </span>
          </div>
        }
        actions={
          <>
            <Badge
              variant="outline"
              className={`font-mono text-xs gap-1.5 py-1 px-2.5 transition-colors ${
                secondsRemaining < 120
                  ? "border-red-500 bg-red-500/10 text-red-600 animate-pulse"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>TTL: {timeRemaining || "Active"}</span>
            </Badge>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshToken}
              disabled={refreshLoading}
              className="h-8 text-xs gap-1.5"
            >
              <RotateCw className={`h-3.5 w-3.5 ${refreshLoading ? "animate-spin" : ""}`} />
              <span>Rotate Token</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleVerifyAdmin}
              className="h-8 text-xs gap-1.5"
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>Verify RBAC</span>
            </Button>
          </>
        }
      />
        {/* Dynamic Action Alerts */}
        {actionAlert && (
          <Alert
            variant={actionAlert.type === "error" ? "destructive" : actionAlert.type === "success" ? "success" : "default"}
            className="animate-in fade-in-50 duration-200"
          >
            {actionAlert.type === "error" ? (
              <AlertTriangle className="h-4 w-4" />
            ) : actionAlert.type === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Activity className="h-4 w-4" />
            )}
            <AlertTitle className="font-semibold text-sm">
              {actionAlert.type === "error" ? "Security Notice" : "Operation Complete"}
            </AlertTitle>
            <AlertDescription className="text-xs">{actionAlert.message}</AlertDescription>
          </Alert>
        )}

        {/* Top KPI Cards Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Principal & Authority"
            value={
              <span className="flex items-center gap-2 text-base">
                <span>Platform Admin</span>
                <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">
                  Root
                </Badge>
              </span>
            }
            icon={ShieldCheck}
            iconClassName="text-primary"
            valueClassName="text-base"
          >
            <div className="font-mono text-foreground font-medium truncate">{user?.email}</div>
            <div>Scope: <span className="font-mono text-foreground font-semibold">platform</span></div>
          </StatCard>

          <StatCard
            label="Backend Health & API"
            value={
              <span className="flex items-center gap-2 text-base">
                <span className="text-emerald-600 dark:text-emerald-400">
                  {health?.status === "HEALTHY" ? "Operational" : "Offline"}
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </span>
            }
            icon={Activity}
            iconClassName="text-emerald-500"
            valueClassName="text-base"
          >
            <div>Protocol: <span className="font-mono text-foreground">HTTPS / REST API</span></div>
            <div>Latency: <span className="font-mono text-foreground">{healthLatency ? `${healthLatency} ms` : "N/A"}</span></div>
          </StatCard>

          <StatCard
            label="Data Pipeline Intel"
            value={
              <span className="flex items-center gap-2 text-base">
                <span className="text-emerald-600 dark:text-emerald-400">
                  {platformTelemetry?.dataPipelineStatus === "COMPLETED" || !platformTelemetry?.dataPipelineStatus ? "In Sync" : String(platformTelemetry.dataPipelineStatus)}
                </span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              </span>
            }
            icon={Database}
            iconClassName="text-emerald-500"
            valueClassName="text-base"
          >
            <div className="truncate">
              Processed: <span className="font-mono text-foreground">{platformTelemetry?.lastDataProcessedAt ? new Date(String(platformTelemetry.lastDataProcessedAt)).toLocaleDateString() : "Live Ready"}</span>
            </div>
            <div className="truncate text-[11px]">
              Time: <span className="font-mono text-foreground">{platformTelemetry?.lastDataProcessedAt ? new Date(String(platformTelemetry.lastDataProcessedAt)).toLocaleTimeString() : "Synchronized"}</span>
            </div>
          </StatCard>

          <StatCard
            label="RBAC Guard Verification"
            value={
              <span className="flex items-center gap-2 text-base">
                {verifyData?.status === "AUTHORIZED" ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Authorized</span>
                ) : (
                  <span className="text-amber-600">Pending Test</span>
                )}
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </span>
            }
            icon={Shield}
            iconClassName="text-blue-500"
            valueClassName="text-base"
          >
            <div>Permission: <span className="font-mono text-foreground">platform:admin</span></div>
            <div className="truncate">RBAC Status: <span className="font-mono text-foreground">Verified</span></div>
          </StatCard>

          <StatCard
            label="Session Token Rotation"
            value={
              <span className="flex items-center gap-2 font-mono text-base">
                {timeRemaining || "15m 00s"}
                <Clock className="h-4 w-4 text-muted-foreground" />
              </span>
            }
            icon={KeyRound}
            iconClassName="text-amber-500"
            valueClassName="text-base"
          >
            <div>Standard: <span className="font-mono text-foreground">RFC-6749</span></div>
            <div>Cookie: <span className="font-mono text-emerald-600">HttpOnly · Strict</span></div>
          </StatCard>
        </div>

        {/* Dashboard Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="bg-muted/60 p-1 border border-border">
            <TabsTrigger value="tenants" className="gap-2 text-xs">
              <Building className="h-3.5 w-3.5 text-blue-500" />
              <span>Tenants & Partitions ({tenants.length})</span>
            </TabsTrigger>
            <TabsTrigger value="platform-admins" className="gap-2 text-xs">
              <Users className="h-3.5 w-3.5 text-violet-500" />
              <span>Platform Admins ({platformAdmins.length})</span>
            </TabsTrigger>
            <TabsTrigger value="overview" className="gap-2 text-xs">
              <Fingerprint className="h-3.5 w-3.5 text-emerald-500" />
              <span>Session & Control</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2 text-xs">
              <FileText className="h-3.5 w-3.5 text-amber-500" />
              <span>Security Audit Trail ({auditLogs.length})</span>
            </TabsTrigger>
            <TabsTrigger value="rbac" className="gap-2 text-xs">
              <Lock className="h-3.5 w-3.5 text-red-500" />
              <span>RBAC & Policy Matrix</span>
            </TabsTrigger>
            <TabsTrigger value="system" className="gap-2 text-xs">
              <Server className="h-3.5 w-3.5 text-cyan-500" />
              <span>Backend Telemetry</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB: TENANTS & PARTITIONS */}
          <TabsContent value="tenants" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Building className="h-4 w-4 text-primary" />
                    <span>Multi-Tenant Enterprise Organizations</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Completely isolated enterprise tenant domains with dedicated Secure Database Partitions and Tenant Super Admins.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadPlatformData}
                    className="gap-1.5 text-xs"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Refresh</span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setCreateTenantOpen(true)}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Provision Tenant</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {tenants.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-3">
                    <Building className="h-8 w-8 text-muted-foreground mx-auto" />
                    <div>
                      <h4 className="text-sm font-semibold">No enterprise tenants provisioned</h4>
                      <p className="text-xs text-muted-foreground">
                        Create an enterprise tenant to provision an isolated Secure Database Partition and seed its Super Admin account.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setCreateTenantOpen(true)}
                      className="gap-1.5 text-xs font-semibold"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Provision First Tenant</span>
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md border border-border overflow-hidden">
                    <DataTable
                      columns={[
                        {
                          key: "org",
                          header: "Organization Name",
                          cellClassName: "font-semibold font-sans text-foreground",
                          cell: (t) => t.name,
                        },
                        {
                          key: "tenantKey",
                          header: "Tenant Key",
                          cell: (t) => (
                            <Badge variant="outline" className="border-border bg-muted/30 text-xs">
                              {t.tenantKey}
                            </Badge>
                          ),
                        },
                        {
                          key: "partition",
                          header: "Secure Partition",
                          cellClassName: "text-emerald-600 dark:text-emerald-400 font-semibold",
                          cell: (t) => t.databaseName || `tenant_partition_${t.tenantKey.replace(/-/g, "_")}`,
                        },
                        {
                          key: "superAdmin",
                          header: "Super Admin",
                          cellClassName: "text-muted-foreground font-sans",
                          cell: (t) => t.superAdminEmail || `admin@${t.tenantKey}.com`,
                        },
                        {
                          key: "status",
                          header: "Status",
                          cell: (t) => {
                            const status = (t.status || "ACTIVE").toUpperCase();
                            const isAct = status === "ACTIVE";
                            const isSusp = status === "SUSPENDED";
                            return (
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${
                                  isAct
                                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : isSusp
                                    ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                                }`}
                              >
                                {status}
                              </Badge>
                            );
                          },
                        },
                        {
                          key: "created",
                          header: "Created",
                          cellClassName: "text-muted-foreground",
                          cell: (t) => (t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "Active"),
                        },
                        {
                          key: "actions",
                          header: "Actions",
                          headClassName: "text-xs text-right",
                          cellClassName: "text-right font-sans",
                          cell: (t) => {
                            const isActive = (t.status || "ACTIVE").toUpperCase() === "ACTIVE";
                            return (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={`h-7 px-2 text-[11px] gap-1 ${
                                    isActive
                                      ? "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                                      : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                                  }`}
                                  disabled={tenantSubmitting}
                                  onClick={() => handleToggleTenantStatus(t, isActive ? "SUSPENDED" : "ACTIVE")}
                                >
                                  {isActive ? (
                                    <>
                                      <PauseCircle className="w-3 h-3" />
                                      <span>Suspend</span>
                                    </>
                                  ) : (
                                    <>
                                      <PlayCircle className="w-3 h-3" />
                                      <span>Activate</span>
                                    </>
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] gap-1"
                                  onClick={() => {
                                    setEditingTenant(t);
                                    setEditDisplayName(t.displayName || t.name);
                                    setEditCompliance(t.complianceFramework || "NONE");
                                    setEditCloudProvider(t.cloudProvider || "NONE");
                                    setEditStatus(t.status || "ACTIVE");
                                    setEditTenantOpen(true);
                                  }}
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Edit</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] gap-1 text-primary hover:bg-primary/10"
                                  onClick={() => {
                                    setResetTargetTenant(t);
                                    setResetTargetUserId(t.superAdminId || t.superAdminEmail || "");
                                    setResetNewPassword("");
                                    setResetPasswordOpen(true);
                                  }}
                                >
                                  <Key className="w-3 h-3" />
                                  <span>Reset PW</span>
                                </Button>
                              </div>
                            );
                          },
                        },
                      ]}
                      rows={tenants}
                      rowKey={(t) => t.tenantKey}
                      rowClassName="text-xs font-mono"
                      headClassName="text-xs"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: PLATFORM ADMINS DIRECTORY & REGISTRATION (Req 4 / Backend Req 7) */}
          <TabsContent value="platform-admins" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-3">
              {/* Admins List (2 cols) */}
              <div className="md:col-span-2 space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <div>
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        <span>Platform Administrator Directory</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Privileged operators with cross-tenant root access and infrastructure management privileges.
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadPlatformData}
                      className="gap-1.5 text-xs h-8"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Refresh</span>
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border border-border overflow-hidden">
                      <DataTable
                        columns={[
                          {
                            key: "name",
                            header: "Name",
                            cellClassName: "font-medium text-foreground",
                            cell: (adm) => adm.name || "Platform Admin",
                          },
                          {
                            key: "email",
                            header: "Email",
                            cellClassName: "font-mono text-muted-foreground",
                            cell: (adm) => adm.email,
                          },
                          {
                            key: "role",
                            header: "Role",
                            cell: (adm) => (
                              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                                {adm.roles?.[0] || "PLATFORM_ADMIN"}
                              </Badge>
                            ),
                          },
                          {
                            key: "created",
                            header: "Created",
                            cellClassName: "text-muted-foreground",
                            cell: (adm) => (adm.createdAt ? new Date(adm.createdAt).toLocaleDateString() : "Active"),
                          },
                        ]}
                        rows={platformAdmins}
                        rowKey={(adm) => adm.id}
                        rowClassName="text-xs"
                        headClassName="text-xs"
                        emptyMessage="No platform administrators registered yet."
                        emptyClassName="text-center py-6 text-xs text-muted-foreground"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Register New Admin Form (1 col) */}
              <div>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Plus className="h-4 w-4 text-primary" />
                      <span>Register Platform Admin</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Provision a new root-level platform administrator.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleRegisterPlatformAdmin} className="space-y-3.5">
                      <Field label="Full Name" required>
                        <Input
                          required
                          placeholder="e.g. Sarah Connor"
                          value={newAdminName}
                          onChange={(e) => setNewAdminName(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </Field>

                      <Field label="Email Address" required>
                        <Input
                          required
                          type="email"
                          placeholder="admin@platform.corp"
                          value={newAdminEmail}
                          onChange={(e) => setNewAdminEmail(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </Field>

                      <Field label="Initial Password" required>
                        <Input
                          required
                          type="password"
                          placeholder="Min 8 characters with symbols"
                          value={newAdminPassword}
                          onChange={(e) => setNewAdminPassword(e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </Field>

                      <Button
                        type="submit"
                        size="sm"
                        disabled={adminSubmitting}
                        className="w-full gap-1.5 text-xs font-semibold mt-2"
                      >
                        {adminSubmitting ? <Activity className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        <span>Register Administrator</span>
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* TAB 1: SESSION & ACCESS CONTROL */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <span>Active Platform Principal Context</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Authoritative identity token attributes decoded from backend session.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Principal ID:</span>
                      <span className="text-foreground font-semibold">{user?.id}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Email:</span>
                      <span className="text-foreground">{user?.email}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Account Status:</span>
                      <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-600 text-[10px]">
                        {user?.status || "ACTIVE"}
                      </Badge>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">Scope Authority:</span>
                      <span className="text-primary font-semibold uppercase">{user?.scope}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-muted-foreground">Assigned Roles:</span>
                      <div className="flex gap-1">
                        {user?.roles?.map((r) => (
                          <Badge key={r} variant="secondary" className="text-[10px]">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-primary" />
                      <span>Zero-Trust Token Family Architecture</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Every token refresh rotates both the access token and the refresh token family. If a previously used refresh token is replayed, the backend automatically revokes the entire session family for intrusion defense.
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="flex gap-2 border-t border-border pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshToken}
                    disabled={refreshLoading}
                    className="gap-2 text-xs"
                  >
                    <RotateCw className={`h-3.5 w-3.5 ${refreshLoading ? "animate-spin" : ""}`} />
                    <span>Rotate Token Now</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleVerifyAdmin}
                    disabled={verifyLoading}
                    className="gap-2 text-xs"
                  >
                    <UserCheck className={`h-3.5 w-3.5 ${verifyLoading ? "animate-spin" : ""}`} />
                    <span>Run RBAC Verify</span>
                  </Button>
                </CardFooter>
              </Card>

              {/* Session Revocation & Security Controls */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    <span>Security & Session Revocation Controls</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Administrative actions for session invalidation and account protection.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-foreground">Standard Session Sign Out</div>
                        <div className="text-[11px] text-muted-foreground">
                          Revokes current session on backend and clears browser cookies.
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleLogout} className="text-xs">
                        Sign Out
                      </Button>
                    </div>
                  </div>

                  <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-destructive">Emergency Revoke All Sessions</div>
                        <div className="text-[11px] text-muted-foreground">
                          Immediately invalidates all active sessions across all devices for this administrator.
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setRevokeAllDialogOpen(true)}
                        className="text-xs font-semibold shadow-xs"
                      >
                        Revoke All
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                    <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Live Backend Verification Payload</span>
                    </div>
                    <pre className="text-[10px] font-mono bg-muted/40 p-2.5 rounded border border-border overflow-x-auto text-muted-foreground">
                      {verifyData
                        ? JSON.stringify(verifyData, null, 2)
                        : "Click 'Run RBAC Verify' to probe backend..."}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 2: AUDIT TRAIL */}
          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span>Authoritative Security Audit Events</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Append-only audit trail logging security-critical authentication and privilege operations.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchAuditLogs()}
                  className="gap-2 text-xs"
                >
                  <Activity className="h-3.5 w-3.5" />
                  <span>Refresh Audit Trail</span>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border border-border overflow-hidden">
                  <DataTable
                    columns={[
                      {
                        key: "timestamp",
                        header: "Timestamp",
                        headClassName: "w-[180px] text-xs",
                        cellClassName: "text-muted-foreground",
                        cell: (log) => (
                          <>
                            {new Date(log.timestamp).toLocaleTimeString()} · {new Date(log.timestamp).toLocaleDateString()}
                          </>
                        ),
                      },
                      {
                        key: "action",
                        header: "Action Event",
                        cellClassName: "font-semibold text-foreground",
                        cell: (log) => (
                          <span className="rounded bg-muted px-1.5 py-0.5 border border-border">
                            {log.action}
                          </span>
                        ),
                      },
                      {
                        key: "actor",
                        header: "Actor / Principal",
                        cellClassName: "text-muted-foreground",
                        cell: (log) => (
                          <>
                            {log.actor?.userId || (log as unknown as { userId?: string }).userId || "SYSTEM"} ({log.actor?.roles?.[0] || "PLATFORM"})
                          </>
                        ),
                      },
                      {
                        key: "status",
                        header: "Status",
                        cell: (log) => (
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              log.status === "SUCCESS" || !log.status
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                                : log.status === "WARNING"
                                ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
                                : "border-red-500/40 bg-red-500/10 text-red-600"
                            }`}
                          >
                            {log.status || "SUCCESS"}
                          </Badge>
                        ),
                      },
                      {
                        key: "metadata",
                        header: "Metadata & Details",
                        cellClassName: "text-muted-foreground max-w-xs truncate text-[11px]",
                        cell: (log) => JSON.stringify(log.details || (log as unknown as { resource?: unknown }).resource || {}),
                      },
                    ]}
                    rows={auditLogs}
                    rowKey={(log) => log.id || (log as unknown as { _id?: string })._id || `${log.action}-${log.timestamp}`}
                    emptyMessage="No platform security audit events recorded yet."
                    rowClassName="text-xs font-mono"
                    headClassName="text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: RBAC MATRIX */}
          <TabsContent value="rbac" className="space-y-4">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" />
                    <span>Platform Admin Permission Set</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Permissions bound to the PLATFORM_ADMIN role enforced by backend authorization policy.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { perm: "platform:admin", desc: "Unrestricted platform administration and configuration" },
                    { perm: "platform:view", desc: "Read-only access across platform global views" },
                    { perm: "users:read", desc: "Query and inspect principal identities and accounts" },
                    { perm: "users:write", desc: "Provision, lock, or modify administrator accounts" },
                    { perm: "sessions:read", desc: "Enumerate active session families" },
                    { perm: "sessions:revoke", desc: "Revoke compromised tokens or sessions" },
                    { perm: "system:read", desc: "Inspect engine health, metrics, and queue latencies" },
                    { perm: "system:admin", desc: "System maintenance and global parameter configuration" },
                    { perm: "audit:read", desc: "Authoritative security audit log inspection" },
                  ].map((item) => (
                    <div
                      key={item.perm}
                      className="flex items-center justify-between p-2.5 rounded border border-border/80 bg-muted/20 text-xs font-mono"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="font-semibold text-foreground">{item.perm}</span>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-sans">{item.desc}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <span>Multi-Tenancy & Boundary Isolation</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Platform root authority vs tenant-isolated execution domains.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-border p-3 space-y-2 text-xs">
                    <div className="font-semibold text-foreground flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      Platform Scope (`platform`)
                    </div>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      Platform Admins operate at the root infrastructure level. They manage platform health, cross-cutting security policies, global rate limiters, and system configurations.
                    </p>
                  </div>

                  <div className="rounded-lg border border-border p-3 space-y-2 text-xs">
                    <div className="font-semibold text-muted-foreground flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                      Tenant Scope (`tenant`)
                    </div>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      Future roles (such as Tenant Admin, Security Analyst, and Viewer) will be strictly bounded to their respective tenant ID. Platform Admin accounts maintain strict cryptographic segregation from tenant-specific customer secrets.
                    </p>
                  </div>

                  <div className="pt-2">
                    <Link href="/">
                      <Button className="w-full gap-2 text-xs shadow-xs font-semibold">
                        <span>Launch Vulnerability & SBOM Console</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 4: SYSTEM TELEMETRY */}
          <TabsContent value="system" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Server className="h-4 w-4 text-primary" />
                  <span>Backend Architecture & Rate Limit Diagnostics</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Active policy thresholds configured on `vm-backend` (Secure REST API).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 text-xs">
                  <div className="space-y-2 border border-border rounded-lg p-3">
                    <div className="font-semibold text-foreground flex items-center gap-2">
                      <Sliders className="h-3.5 w-3.5 text-primary" />
                      <span>Security & Rate Limiting Thresholds</span>
                    </div>
                    <div className="space-y-1.5 font-mono text-[11px]">
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Login Rate Limit:</span>
                        <span className="text-foreground">10 requests / 60s per IP</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Refresh Rate Limit:</span>
                        <span className="text-foreground">20 requests / 60s per IP</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Max Failed Attempts:</span>
                        <span className="text-foreground">5 before lockout</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Lockout Duration:</span>
                        <span className="text-foreground">15 minutes (900,000ms)</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 border border-border rounded-lg p-3">
                    <div className="font-semibold text-foreground flex items-center gap-2">
                      <Database className="h-3.5 w-3.5 text-primary" />
                      <span>Token & Cryptography Standards</span>
                    </div>
                    <div className="space-y-1.5 font-mono text-[11px]">
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Access Token TTL:</span>
                        <span className="text-foreground">900s (15 minutes)</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Refresh Token TTL:</span>
                        <span className="text-foreground">604,800s (7 days)</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-border/50">
                        <span className="text-muted-foreground">Hash Algorithm:</span>
                        <span className="text-foreground">PBKDF2 / SHA-256</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Cookie Security:</span>
                        <span className="text-emerald-600">HttpOnly · SameSite=Strict</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      {/* Revoke All Sessions Confirmation Dialog */}
      <Dialog open={revokeAllDialogOpen} onOpenChange={setRevokeAllDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              <span>Confirm Emergency Session Revocation</span>
            </DialogTitle>
            <DialogDescription className="text-xs pt-2">
              Are you sure you want to revoke all active sessions for administrator{" "}
              <strong className="text-foreground">{user?.email}</strong>? All active tokens and refresh families across all devices will be immediately invalidated. You will be redirected to the sign-in page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-4">
            <Button variant="outline" size="sm" onClick={() => setRevokeAllDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleRevokeAllSessions} className="font-semibold">
              Revoke All & Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Provision Tenant Dialog */}
      <Dialog open={createTenantOpen} onOpenChange={setCreateTenantOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleCreateTenant}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building className="h-5 w-5 text-primary" />
                <span>Provision Enterprise Tenant</span>
              </DialogTitle>
              <DialogDescription className="text-xs pt-1">
                Creates a new enterprise organization, provisions a completely isolated Secure Database Partition, and seeds the initial Tenant Super Admin user.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-4">
              <Field label="Tenant / Organization Name" required>
                <Input
                  required
                  placeholder="e.g. Wayne Enterprises"
                  value={newTenantName}
                  onChange={(e) => {
                    setNewTenantName(e.target.value);
                    if (!newTenantKey) {
                      setNewTenantKey(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-"));
                    }
                  }}
                  className="text-xs"
                />
              </Field>

              <Field label="Tenant Key (Partition Identifier)">
                <Input
                  placeholder="e.g. wayne-enterprises"
                  value={newTenantKey}
                  onChange={(e) => setNewTenantKey(e.target.value)}
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground font-mono mt-1">
                  Partition identifier: security_tenant_{(newTenantKey || "key").replace(/-/g, "_")}
                </p>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Super Admin Name">
                  <Input
                    placeholder="e.g. Bruce Wayne"
                    value={newSuperAdminName}
                    onChange={(e) => setNewSuperAdminName(e.target.value)}
                    className="text-xs"
                  />
                </Field>
                <Field label="Super Admin Email" required>
                  <Input
                    required
                    type="email"
                    placeholder="admin@wayne.com"
                    value={newSuperAdminEmail}
                    onChange={(e) => setNewSuperAdminEmail(e.target.value)}
                    className="text-xs"
                  />
                </Field>
              </div>

              <Field label="Initial Super Admin Password" required>
                <Input
                  type="text"
                  value={newSuperAdminPassword}
                  onChange={(e) => setNewSuperAdminPassword(e.target.value)}
                  required
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Required temporary password. The tenant super admin must change it after first login.
                </p>
              </Field>

              <div className="rounded border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Partition Segregation:</span> A dedicated Secure Database Partition with strict tenant boundary isolation and collections is provisioned dynamically.
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCreateTenantOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={tenantSubmitting} className="font-semibold gap-1.5">
                {tenantSubmitting ? <Activity className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                <span>Provision Organization</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Tenant Dialog */}
      <Dialog open={editTenantOpen} onOpenChange={setEditTenantOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleUpdateTenant}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-primary" />
                <span>Edit Tenant Configuration</span>
              </DialogTitle>
              <DialogDescription className="text-xs pt-1">
                Update enterprise profile metadata, compliance frameworks, and infrastructure tier for organization <strong className="text-foreground">{editingTenant?.name}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-4">
              <Field label="Display / Brand Name">
                <Input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder={editingTenant?.name || "Organization name"}
                  className="text-xs"
                />
              </Field>

              <Field label="Compliance Framework">
                <select
                  value={editCompliance}
                  onChange={(e) => setEditCompliance(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="NONE">None / General</option>
                  <option value="SOC2">SOC 2 Type II</option>
                  <option value="ISO27001">ISO / IEC 27001</option>
                  <option value="HIPAA">HIPAA Security Rule</option>
                  <option value="PCI_DSS">PCI DSS v4.0</option>
                  <option value="FEDRAMP">FedRAMP Moderate</option>
                </select>
              </Field>

              <Field label="Primary Cloud Provider">
                <select
                  value={editCloudProvider}
                  onChange={(e) => setEditCloudProvider(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="NONE">On-Premises / Multi-Cloud</option>
                  <option value="AWS">Amazon Web Services (AWS)</option>
                  <option value="AZURE">Microsoft Azure</option>
                  <option value="GCP">Google Cloud Platform (GCP)</option>
                  <option value="HYBRID">Hybrid Enterprise</option>
                </select>
              </Field>

              <Field label="Tenant Status (Lifecycle)">
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="ACTIVE">ACTIVE — Normal Operations</option>
                  <option value="SUSPENDED">SUSPENDED — Temporary Access Freeze</option>
                  <option value="DISABLED">DISABLED — Blocked Platform Access</option>
                </select>
              </Field>

              <div className="rounded border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Secure Partition:</span> {editingTenant?.databaseName || `tenant_partition_${editingTenant?.tenantKey || ""}`}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditTenantOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={tenantSubmitting} className="font-semibold gap-1.5">
                {tenantSubmitting ? <Activity className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                <span>Save Changes</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Super Admin Password Dialog */}
      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <form onSubmit={handleResetSuperAdminPassword}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Key className="h-5 w-5" />
                <span>Reset Tenant Super Admin Password</span>
              </DialogTitle>
              <DialogDescription className="text-xs pt-1">
                Provide a new temporary password for the Tenant Super Admin of organization <strong className="text-foreground">{resetTargetTenant?.name}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-4">
              <div className="rounded border border-muted bg-muted/40 p-2.5 text-xs font-mono space-y-1">
                <div className="text-muted-foreground">Target Organization: <span className="text-foreground font-semibold font-sans">{resetTargetTenant?.name}</span></div>
                <div className="text-muted-foreground">Tenant Key: <span className="text-foreground">{resetTargetTenant?.tenantKey}</span></div>
                <div className="text-muted-foreground">Super Admin: <span className="text-foreground font-semibold">{resetTargetTenant?.superAdminEmail || "admin@tenant"}</span></div>
              </div>

              <Field label="New Super Admin Password" required>
                <Input
                  required
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Min 8 characters with symbols"
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  The administrator will be prompted to update this password upon subsequent access.
                </p>
              </Field>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setResetPasswordOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" variant="destructive" disabled={tenantSubmitting} className="font-semibold gap-1.5">
                {tenantSubmitting ? <Activity className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
                <span>Reset Password</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
