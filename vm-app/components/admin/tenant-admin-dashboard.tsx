"use client";

import React, { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Users,
  FolderGit2,
  ScrollText,
  GitBranch,
  Plus,
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  GitFork,
  Cloud,
  Server,
  Building,
  UserPlus,
  Power,
  Layers,
  Loader2,
  ChevronRight,
  Search,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Field } from "@/components/shared/form-field";
import { FormActions } from "@/components/shared/form-actions";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SectionHeader } from "@/components/shared/section-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import {
  useGetTenantUsersQuery,
  useGetTenantProjectsQuery,
  useGetTenantAssetsQuery,
  useGetTenantAuditLogsQuery,
  useGetTenantIntegrationsQuery,
  useCreateTenantUserMutation,
  useUpdateTenantUserStatusMutation,
  useCreateTenantProjectMutation,
  useUpdateTenantProjectStatusMutation,
  useAssignTenantProjectMemberMutation,
  useCreateTenantAssetMutation,
  useDeleteTenantAssetMutation,
  useCreateTenantIntegrationMutation,
  useTestTenantIntegrationMutation,
  useDeleteTenantIntegrationMutation,
  useGetTenantDashboardQuery,
  useGetIntegrationRepositoriesQuery,
  useTriggerTenantScanMutation,
} from "@/lib/store/api";
import type { TenantAsset, TenantAuditLog, TenantIntegration, TenantProject, TenantUser } from "@/lib/types";
import { DataTable } from "@/components/shared/data-table";

export function TenantAdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { user, accessToken, isTenantSuperAdmin, isPlatformAdmin, hasPermission } = useAuth();
  const canManageEnterprise = Boolean(isTenantSuperAdmin || isPlatformAdmin);
  const canViewAudit = hasPermission("audit:read");
  const tabParam = searchParams.get("tab");
  // Sidebar links must resolve to a tab that actually has content; unknown
  // values fall back to a valid tab so the page never renders empty.
  const TENANT_TAB_ALIASES: Record<string, string> = {
    projects: "overview",
    members: "users",
  };
  const TENANT_TAB_VALUES = [
    "overview",
    "users",
    "integrations",
    "audit",
    "assets",
    "onboard-asset",
    "add-project",
    "add-user",
  ];
  const [tabState, setTabState] = useState<string>("overview");
  const aliasTab = tabParam ? TENANT_TAB_ALIASES[tabParam] ?? tabParam : null;
  const activeTab =
    aliasTab && TENANT_TAB_VALUES.includes(aliasTab)
      ? aliasTab
      : TENANT_TAB_VALUES.includes(tabState)
        ? tabState
        : "overview";
  // Form tabs render as standalone pages: hide KPI cards + action bar so the
  // form is not displayed underneath the overview cards.
  const isFormTab = activeTab === "onboard-asset" || activeTab === "add-project" || activeTab === "add-user";
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleTabChange = (tab: string) => {
    setTabState(tab);
    router.push(`/tenant-admin?tab=${tab}`);
  };

  // Server data hooks via RTK Query (eliminates local state arrays & double fetch)
  const { data: usersData, refetch: refetchUsers } = useGetTenantUsersQuery(undefined, { skip: !accessToken });
  const { data: projectsData, refetch: refetchProjects } = useGetTenantProjectsQuery(undefined, { skip: !accessToken });
  const { data: assetsData, refetch: refetchAssets } = useGetTenantAssetsQuery(undefined, { skip: !accessToken });
  const { data: auditLogsData, refetch: refetchAuditLogs } = useGetTenantAuditLogsQuery(undefined, {
    skip: !accessToken || !canViewAudit,
  });
  const { data: integrationsData, refetch: refetchIntegrations } = useGetTenantIntegrationsQuery(undefined, { skip: !accessToken });
  const { data: tenantDashData, refetch: refetchDashboard } = useGetTenantDashboardQuery(undefined, { skip: !accessToken });
  const dashboardStats = tenantDashData?.data;

  const [createUserMutation] = useCreateTenantUserMutation();
  const [updateUserStatusMutation] = useUpdateTenantUserStatusMutation();
  const [createProjectMutation] = useCreateTenantProjectMutation();
  const [updateProjectStatusMutation] = useUpdateTenantProjectStatusMutation();
  const [assignProjectMemberMutation] = useAssignTenantProjectMemberMutation();
  const [createAssetMutation] = useCreateTenantAssetMutation();
  const [deleteAssetMutation] = useDeleteTenantAssetMutation();
  const [createIntegrationMutation] = useCreateTenantIntegrationMutation();
  const [testIntegrationMutation] = useTestTenantIntegrationMutation();
  const [deleteIntegrationMutation] = useDeleteTenantIntegrationMutation();
  const [triggerScanMutation, { isLoading: isScanTriggering }] = useTriggerTenantScanMutation();

  const users: TenantUser[] = usersData?.data ?? [];
  const projects: TenantProject[] = projectsData?.data ?? [];
  const assets: TenantAsset[] = assetsData?.data ?? [];
  const auditLogs: TenantAuditLog[] = auditLogsData?.data ?? [];
  const integrations: TenantIntegration[] = integrationsData?.data ?? [];

  // Interactive Repository Scan modal state (R5)
  const [repoModalOpen, setRepoModalOpen] = useState(false);
  const [activeRepoIntegration, setActiveRepoIntegration] = useState<TenantIntegration | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [scanBranch, setScanBranch] = useState("main");
  const [scanManifestPath, setScanManifestPath] = useState("");
  const [scanProjectId, setScanProjectId] = useState("");

  const { data: reposData, isFetching: isFetchingRepos } = useGetIntegrationRepositoriesQuery(
    activeRepoIntegration?.id ?? "",
    { skip: !activeRepoIntegration?.id || !repoModalOpen }
  );
  const availableRepos = reposData?.data ?? [];

  // Asset filtering state (Req 21)
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [assetCriticalityFilter, setAssetCriticalityFilter] = useState("all");
  const [assetExposureFilter, setAssetExposureFilter] = useState("all");
  const [assetSearchQuery, setAssetSearchQuery] = useState("");

  const filteredAssets = assets.filter((asset: TenantAsset) => {
    if (assetTypeFilter !== "all" && asset.type !== assetTypeFilter) return false;
    if (assetCriticalityFilter !== "all" && String(asset.criticality) !== assetCriticalityFilter) return false;
    if (assetExposureFilter !== "all" && asset.exposure !== assetExposureFilter) return false;
    if (assetSearchQuery.trim()) {
      const q = assetSearchQuery.toLowerCase();
      const match =
        (asset.name && asset.name.toLowerCase().includes(q)) ||
        (asset.ipAddress && asset.ipAddress.toLowerCase().includes(q)) ||
        (asset.hostname && asset.hostname.toLowerCase().includes(q)) ||
        (asset.owner && asset.owner.toLowerCase().includes(q)) ||
        (asset.platform && asset.platform.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Asset Onboarding form fields
  const [assetName, setAssetName] = useState("");
  const [assetType, setAssetType] = useState("server");
  const [assetEnvironment, setAssetEnvironment] = useState("production");
  const [assetCriticality, setAssetCriticality] = useState("1");
  const [assetExposure, setAssetExposure] = useState("internal");
  const [assetIpAddress, setAssetIpAddress] = useState("");
  const [assetHostname, setAssetHostname] = useState("");
  const [assetOwner, setAssetOwner] = useState("");
  const [assetProjectId, setAssetProjectId] = useState("");
  const [assetPlatform, setAssetPlatform] = useState("linux");
  const [assetDescription, setAssetDescription] = useState("");
  const [assetTags, setAssetTags] = useState("");

  // Modals state
  const [assignMemberOpen, setAssignMemberOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedProjectForMember, setSelectedProjectForMember] = useState<TenantProject | null>(null);
  const [selectedUserForAssign, setSelectedUserForAssign] = useState<string>("");
  const [memberRoleForAssign, setMemberRoleForAssign] = useState<string>("MEMBER");

  // User Onboarding form fields
  const [userFirstName, setUserFirstName] = useState("");
  const [userLastName, setUserLastName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userTitle, setUserTitle] = useState("");
  const [userEmployeeId, setUserEmployeeId] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [userRole, setUserRole] = useState("END_USER");
  const [userSelectedProjects, setUserSelectedProjects] = useState<string[]>([]);

  // Project Onboarding form fields
  const [projectName, setProjectName] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [projectDepartment, setProjectDepartment] = useState("");
  const [projectStartDate, setProjectStartDate] = useState("");
  const [projectEndDate, setProjectEndDate] = useState("");
  const [projectStage, setProjectStage] = useState("DEV");
  const [projectCloudProvider, setProjectCloudProvider] = useState("NONE");
  const [projectMembers, setProjectMembers] = useState<string[]>([]);

  // Dynamic cloud metadata fields
  const [awsAccountId, setAwsAccountId] = useState("");
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [awsRoleArn, setAwsRoleArn] = useState("");
  const [azureSubscriptionId, setAzureSubscriptionId] = useState("");
  const [azureTenantId, setAzureTenantId] = useState("");
  const [azureResourceGroup, setAzureResourceGroup] = useState("");
  const [gcpProjectId, setGcpProjectId] = useState("");
  const [gcpRegion, setGcpRegion] = useState("us-central1");
  const [gcpServiceAccount, setGcpServiceAccount] = useState("");
  const [onPremClusterHost, setOnPremClusterHost] = useState("");
  const [onPremDatacenter, setOnPremDatacenter] = useState("");

  // Interactive SCM / Cloud Integration Modal State
  const [integrationModalOpen, setIntegrationModalOpen] = useState(false);
  const [activeIntegrationProvider, setActiveIntegrationProvider] = useState<{
    id: string;
    name: string;
    type: "SCM" | "CLOUD";
    description: string;
  } | null>(null);

  // Generic integration form inputs
  const [intName, setIntName] = useState("");
  const [intTargetProjectId, setIntTargetProjectId] = useState("");
  const [intField1, setIntField1] = useState(""); // Org / Account / Host / Workspace
  const [intField2, setIntField2] = useState(""); // Token / Access Key / Client ID / App Password
  const [intField3, setIntField3] = useState(""); // Secret / Secret Key / Client Secret / Webhook Secret
  const [intField4, setIntField4] = useState(""); // Region / Tenant ID / Group Path

  const loadData = useCallback(() => {
    refetchUsers();
    refetchProjects();
    refetchAssets();
    refetchAuditLogs();
    refetchIntegrations();
    refetchDashboard();
  }, [refetchUsers, refetchProjects, refetchAssets, refetchAuditLogs, refetchIntegrations, refetchDashboard]);

  // Derived stats
  const activeProjects = projects.filter((p) => (p.status || "ACTIVE") === "ACTIVE");
  const devProjects = projects.filter((p) => p.stage === "DEV");
  const testProjects = projects.filter((p) => p.stage === "TEST");
  const prodProjects = projects.filter((p) => p.stage === "PROD");
  const activeUsers = users.filter((u) => (u.status || "ACTIVE") === "ACTIVE");
  const usersWithProjects = users.filter((u) => (u.assignedProjectIds?.length || 0) > 0);

  // Status toggle handler
  const handleToggleProjectStatus = async (project: TenantProject) => {
    if (!accessToken) return;
    const currentStatus = project.status || "ACTIVE";
    const nextStatus = currentStatus === "ACTIVE" ? "DISABLED" : "ACTIVE";
    setLoading(true);
    try {
      await updateProjectStatusMutation({ projectId: project.id, status: nextStatus }).unwrap();
      setMessage({
        type: "success",
        text: `Project "${project.name}" has been ${nextStatus === "ACTIVE" ? "activated" : "deactivated"}.`,
      });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update project status.",
      });
    } finally {
      setLoading(false);
    }
  };

  // User status toggle handler (G1)
  const handleToggleUserStatus = async (targetUser: TenantUser) => {
    if (!accessToken) return;
    const currentStatus = targetUser.status || "ACTIVE";
    const nextStatus = currentStatus === "ACTIVE" ? "DISABLED" : "ACTIVE";
    setLoading(true);
    try {
      await updateUserStatusMutation({ userId: targetUser.id, status: nextStatus }).unwrap();
      const actionText = nextStatus === "ACTIVE" ? "activated" : "deactivated";
      const userDisplay = targetUser.name || targetUser.email;
      setMessage({
        type: "success",
        text: `User "${userDisplay}" has been ${actionText}.`,
      });
      showToast(`User "${userDisplay}" has been ${actionText}.`, "success");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to update user status.";
      setMessage({
        type: "error",
        text: errorMsg,
      });
      showToast(errorMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  // Create Project handler
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageEnterprise) {
      showToast("Only Tenant Super Admin can create enterprise projects.", "error");
      return;
    }
    if (projectName.trim().length < 2) {
      showToast("Project name must be at least 2 characters.", "error");
      return;
    }
    setLoading(true);
    setMessage(null);

    // Build cloud metadata based on selected provider
    const cloudMetadata: Record<string, unknown> = {};
    if (projectCloudProvider === "AWS") {
      cloudMetadata.accountId = awsAccountId;
      cloudMetadata.region = awsRegion;
      cloudMetadata.roleArn = awsRoleArn;
    } else if (projectCloudProvider === "AZURE") {
      cloudMetadata.subscriptionId = azureSubscriptionId;
      cloudMetadata.tenantId = azureTenantId;
      cloudMetadata.resourceGroup = azureResourceGroup;
    } else if (projectCloudProvider === "GCP") {
      cloudMetadata.projectId = gcpProjectId;
      cloudMetadata.region = gcpRegion;
      cloudMetadata.serviceAccount = gcpServiceAccount;
    } else if (projectCloudProvider === "ON_PREM") {
      cloudMetadata.clusterHost = onPremClusterHost;
      cloudMetadata.datacenter = onPremDatacenter;
    }

    try {
      await createProjectMutation({
        name: projectName.trim(),
        key: projectKey.trim().toUpperCase() || undefined,
        description: projectDesc.trim(),
        department: projectDepartment.trim(),
        startDate: projectStartDate || undefined,
        endDate: projectEndDate || undefined,
        stage: projectStage,
        cloudProvider: projectCloudProvider,
        cloudMetadata: Object.keys(cloudMetadata).length > 0 ? cloudMetadata : undefined,
        assignedUserIds: projectMembers.length > 0 ? projectMembers : undefined,
      }).unwrap();

      showToast(`Enterprise project "${projectName}" onboarded successfully.`, "success");
      resetProjectForm();
      handleTabChange("overview");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to create project.";
      setMessage({ type: "error", text: errorMsg });
      showToast(errorMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  const resetProjectForm = () => {
    setProjectName("");
    setProjectKey("");
    setProjectDesc("");
    setProjectDepartment("");
    setProjectStartDate("");
    setProjectEndDate("");
    setProjectStage("DEV");
    setProjectCloudProvider("NONE");
    setProjectMembers([]);
    setAwsAccountId("");
    setAwsRoleArn("");
    setAzureSubscriptionId("");
    setAzureTenantId("");
    setAzureResourceGroup("");
    setGcpProjectId("");
    setGcpServiceAccount("");
    setOnPremClusterHost("");
    setOnPremDatacenter("");
  };

  // Create User handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageEnterprise) {
      showToast("Only Tenant Super Admin can provision users.", "error");
      return;
    }
    if (!userEmail.trim()) {
      showToast("Please enter a valid work email.", "error");
      return;
    }
    setLoading(true);
    setMessage(null);

    try {
      await createUserMutation({
        email: userEmail.trim(),
        password: userPassword || undefined,
        firstName: userFirstName.trim(),
        lastName: userLastName.trim(),
        title: userTitle.trim(),
        employeeId: userEmployeeId.trim(),
        department: userDepartment.trim(),
        roles: [userRole],
        assignedProjectIds: userSelectedProjects,
      }).unwrap();

      showToast(`User ${userEmail} provisioned successfully and assigned to ${userSelectedProjects.length} project(s).`, "success");
      resetUserForm();
      handleTabChange("users");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to provision user.";
      setMessage({ type: "error", text: errorMsg });
      showToast(errorMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  const resetUserForm = () => {
    setUserFirstName("");
    setUserLastName("");
    setUserEmail("");
    setUserPassword("");
    setUserTitle("");
    setUserEmployeeId("");
    setUserDepartment("");
    setUserRole("END_USER");
    setUserSelectedProjects([]);
  };

  // Onboard Asset handler (Req 21)
  const handleOnboardAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName.trim()) {
      showToast("Please provide an asset name.", "error");
      return;
    }
    setLoading(true);
    try {
      const parsedTags = assetTags
        ? assetTags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      await createAssetMutation({
        name: assetName.trim(),
        type: assetType,
        environment: assetEnvironment,
        criticality: Number(assetCriticality) || 1,
        exposure: assetExposure,
        ipAddress: assetIpAddress.trim() || undefined,
        hostname: assetHostname.trim() || undefined,
        owner: assetOwner.trim() || undefined,
        projectId: assetProjectId || undefined,
        platform: assetPlatform.trim() || undefined,
        description: assetDescription.trim() || undefined,
        tags: parsedTags,
      }).unwrap();

      showToast(`Asset "${assetName}" successfully onboarded into project scope.`, "success");
      resetAssetForm();
      handleTabChange("assets");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to onboard asset.";
      showToast(errorMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  const resetAssetForm = () => {
    setAssetName("");
    setAssetType("server");
    setAssetEnvironment("production");
    setAssetCriticality("1");
    setAssetExposure("internal");
    setAssetIpAddress("");
    setAssetHostname("");
    setAssetOwner("");
    setAssetProjectId("");
    setAssetPlatform("linux");
    setAssetDescription("");
    setAssetTags("");
  };

  const handleDeleteAsset = async (assetId: string) => {
    setLoading(true);
    try {
      await deleteAssetMutation(assetId).unwrap();
      showToast("Asset removed from security perimeter.", "success");
      setAssetToDelete(null);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to delete asset.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Assign Member to Project handler
  const handleAssignMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageEnterprise) {
      showToast("Only Tenant Super Admin can configure project members.", "error");
      return;
    }
    if (!selectedProjectForMember || !selectedUserForAssign) return;
    setLoading(true);
    try {
      await assignProjectMemberMutation({
        projectId: selectedProjectForMember.id,
        userId: selectedUserForAssign,
        role: memberRoleForAssign,
      }).unwrap();

      setMessage({
        type: "success",
        text: `User successfully assigned to project "${selectedProjectForMember.name}".`,
      });
      setAssignMemberOpen(false);
      setSelectedUserForAssign("");
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to assign member to project.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Open provider-specific configuration modal
  const openIntegrationModal = (provider: {
    id: string;
    name: string;
    type: "SCM" | "CLOUD";
    description: string;
  }) => {
    setActiveIntegrationProvider(provider);
    setIntName(`${provider.name} Integration`);
    setIntTargetProjectId("");
    setIntField1("");
    setIntField2("");
    setIntField3("");
    setIntField4("");
    setIntegrationModalOpen(true);
  };

  // Save integration to tenant database
  const handleSaveIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeIntegrationProvider || !intName.trim()) return;
    setLoading(true);
    setMessage(null);

    const providerId = activeIntegrationProvider.id;
    let credentials: Record<string, unknown> = {};
    let config: Record<string, unknown> = {};

    if (providerId === "github") {
      credentials = { personalAccessToken: intField2, webhookSecret: intField3 };
      config = { organization: intField1 };
    } else if (providerId === "gitlab") {
      credentials = { privateToken: intField2 };
      config = { hostUrl: intField1 || "https://gitlab.com", groupPath: intField4 };
    } else if (providerId === "bitbucket") {
      credentials = { appPassword: intField2 };
      config = { workspace: intField1, repoSlug: intField4 };
    } else if (providerId === "codecommit") {
      credentials = { accessKeyId: intField2, secretAccessKey: intField3 };
      config = { accountId: intField1, region: intField4 || "us-east-1" };
    } else if (providerId === "aws_cloud") {
      credentials = { accessKeyId: intField2, secretAccessKey: intField3 };
      config = { accountId: intField1, region: intField4 || "us-east-1" };
    } else if (providerId === "azure_cloud") {
      credentials = { clientId: intField2, clientSecret: intField3 };
      config = { subscriptionId: intField1, tenantId: intField4 };
    } else if (providerId === "gcp_cloud") {
      credentials = { serviceAccountKey: intField2 };
      config = { projectId: intField1, region: intField4 || "us-central1" };
    } else if (providerId === "onprem_agent") {
      credentials = { agentToken: intField2 };
      config = { clusterUrl: intField1, datacenter: intField4 };
    }

    try {
      await createIntegrationMutation({
        type: activeIntegrationProvider.id.toUpperCase(),
        name: intName.trim(),
        projectId: intTargetProjectId || undefined,
        credentials,
        config,
      }).unwrap();

      setMessage({
        type: "success",
        text: `${activeIntegrationProvider.name} integration configured and persisted in tenant database.`,
      });
      setIntegrationModalOpen(false);
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to register integration.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Test integration handler
  const handleTestIntegration = async (integrationId: string) => {
    setLoading(true);
    try {
      await testIntegrationMutation(integrationId).unwrap();
      setMessage({ type: "success", text: "Integration connection verified successfully." });
    } catch (err: unknown) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Integration connection check failed.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Delete integration handler (G3)
  const handleDeleteIntegration = async (integrationId: string, integrationName: string) => {
    if (!canManageEnterprise) {
      showToast("Only Tenant Super Admin can remove integrations.", "error");
      return;
    }
    setLoading(true);
    try {
      await deleteIntegrationMutation(integrationId).unwrap();
      setMessage({ type: "success", text: `Integration "${integrationName}" removed.` });
      showToast(`Integration "${integrationName}" removed.`, "success");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to delete integration.";
      setMessage({ type: "error", text: errorMsg });
      showToast(errorMsg, "error");
    } finally {
      setLoading(false);
    }
  };

  // Open repository scan dialog (R5)
  const openRepoScanModal = (integration: TenantIntegration) => {
    setActiveRepoIntegration(integration);
    setSelectedRepoId("");
    setScanBranch("main");
    setScanManifestPath("");
    setScanProjectId(integration.projectId || (projects[0]?.id ?? ""));
    setRepoModalOpen(true);
  };

  const handleTriggerRepoScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRepoIntegration || !selectedRepoId) return;
    try {
      const res = await triggerScanMutation({
        id: activeRepoIntegration.id,
        repositoryId: selectedRepoId,
        projectId: scanProjectId || undefined,
        branch: scanBranch || "main",
        manifestPath: scanManifestPath || undefined,
      }).unwrap();
      showToast(res.message || "Repository vulnerability scan queued successfully", "success");
      setRepoModalOpen(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to queue repository scan", "error");
    }
  };

  // Available SCM Providers
  const scmProviders = [
    { id: "github", name: "GitHub", type: "SCM" as const, description: "GitHub Cloud & GitHub Enterprise repos" },
    { id: "gitlab", name: "GitLab", type: "SCM" as const, description: "GitLab.com or Self-Hosted GitLab CI/CD" },
    { id: "bitbucket", name: "Bitbucket", type: "SCM" as const, description: "Atlassian Bitbucket Cloud & Server" },
    { id: "codecommit", name: "AWS CodeCommit", type: "SCM" as const, description: "IAM-secured AWS Git repositories" },
  ];

  // Available Cloud Providers
  const cloudProviders = [
    { id: "aws_cloud", name: "AWS Cloud & Security Hub", type: "CLOUD" as const, description: "Amazon Inspector, ECR & Security Hub" },
    { id: "azure_cloud", name: "Microsoft Defender for Cloud", type: "CLOUD" as const, description: "Azure DevOps, ACR & Defender alerts" },
    { id: "gcp_cloud", name: "Google Cloud SCC", type: "CLOUD" as const, description: "Artifact Registry & Security Command Center" },
    { id: "onprem_agent", name: "On-Premises Private Agent", type: "CLOUD" as const, description: "Self-hosted scanner agent, Harbor & local clusters" },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions Bar */}
      <PageHeader
        badges={
          <>
            <Badge variant="outline" className="font-mono text-xs bg-muted/40">
              Tenant: {user?.tenantId || "default"}
            </Badge>
            <Badge className="bg-primary/10 text-primary border-primary/20 text-[11px]">
              Super Admin Console
            </Badge>
          </>
        }
        title="Tenant Administration & Governance"
        description="Onboard enterprise projects, assign multi-project memberships, configure SCM & cloud connectors, and view tenant logs."
        actions={
          <div className={`flex items-center gap-2 ${isFormTab ? "hidden" : ""}`}>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-1.5 text-xs h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
          <Button
            size="sm"
            onClick={() => handleTabChange("add-project")}
            disabled={!canManageEnterprise}
            title={!canManageEnterprise ? "Only Tenant Super Admin can create enterprise projects" : undefined}
            className="gap-1.5 text-xs h-8"
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>New Project</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleTabChange("onboard-asset")}
            className="gap-1.5 text-xs h-8"
          >
            <Server className="w-3.5 h-3.5" />
            <span>Onboard Asset</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleTabChange("add-user")}
            disabled={!canManageEnterprise}
            title={!canManageEnterprise ? "Only Tenant Super Admin can provision users" : undefined}
            className="gap-1.5 text-xs h-8"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Invite User</span>
          </Button>
          </div>
        }
      />

      {message && (
        <div
          className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/40"
              : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800/40"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Top Analytics Metrics Cards (hidden on standalone form pages) */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${isFormTab ? "hidden" : ""}`}>
        <StatCard
          label="Enterprise Projects"
          value={projects.length}
          icon={FolderGit2}
          iconClassName="text-primary"
          note={
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-emerald-600">{activeProjects.length} Active</span>
              <span>·</span>
              <span>
                {dashboardStats?.overview?.riskPostureScore !== undefined
                  ? `Posture Score: ${dashboardStats.overview.riskPostureScore}/100`
                  : `${devProjects.length} Dev / ${testProjects.length} Test / ${prodProjects.length} Prod`}
              </span>
            </span>
          }
        />

        <StatCard
          label="Tenant Users"
          value={users.length}
          icon={Users}
          iconClassName="text-blue-600"
          note={
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-emerald-600">{activeUsers.length} Active</span>
              <span>·</span>
              <span>{usersWithProjects.length} assigned to projects</span>
            </span>
          }
        />

        <StatCard
          label="SCM & Cloud Integrations"
          value={integrations.length}
          icon={GitBranch}
          iconClassName="text-purple-600"
          note={
            dashboardStats?.overview?.totalScans !== undefined
              ? `${dashboardStats.overview.completedScans} Completed / ${dashboardStats.overview.failedScans} Failed Scans`
              : "Connected GitHub, GitLab, AWS, Azure & GCP"
          }
        />

        <StatCard
          label="SLA Compliance & Governance"
          value={dashboardStats?.findings?.sla ? `${dashboardStats.findings.sla.complianceRate}% SLA` : `${auditLogs.length} Events`}
          icon={dashboardStats?.findings?.sla ? ShieldAlert : ScrollText}
          iconClassName={dashboardStats?.findings?.sla?.breachedSla ? "text-rose-600" : "text-amber-600"}
          note={
            dashboardStats?.findings?.sla ? (
              <span className="flex items-center gap-1.5">
                <span className={dashboardStats.findings.sla.breachedSla > 0 ? "font-semibold text-rose-600" : "font-semibold text-emerald-600"}>
                  {dashboardStats.findings.sla.breachedSla} Breached
                </span>
                <span>·</span>
                <span>{dashboardStats.findings.sla.withinSla} within SLA ({auditLogs.length} audit logs)</span>
              </span>
            ) : "Immutable governance events recorded"
          }
        />
      </div>

      {/* Main Tabs Container */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className={`bg-muted/60 p-1 ${isFormTab ? "hidden" : ""}`}>
          <TabsTrigger value="overview" className="gap-2 text-xs">
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            <span>Projects Overview ({projects.length})</span>
          </TabsTrigger>
          <TabsTrigger value="assets" className="gap-2 text-xs">
            <Server className="w-3.5 h-3.5 text-emerald-500" />
            <span>Asset Management ({assets.length})</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2 text-xs">
            <Users className="w-3.5 h-3.5 text-violet-500" />
            <span>Users & Memberships ({users.length})</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2 text-xs">
            <GitBranch className="w-3.5 h-3.5 text-amber-500" />
            <span>SCM & Cloud Integrations ({integrations.length})</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2 text-xs">
            <ScrollText className="w-3.5 h-3.5 text-rose-500" />
            <span>Tenant Audit Logs ({canViewAudit ? auditLogs.length : "Locked"})</span>
          </TabsTrigger>
        </TabsList>

        {/* ── 1. PROJECTS TAB ──────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-4">
          <SectionHeader
            title="Configured Enterprise Projects"
            description="All vulnerability scans, findings, and team members are isolated within their assigned project scopes."
            action={
              <Button size="sm" onClick={() => handleTabChange("add-project")} className="gap-1.5 text-xs h-8">
                <Plus className="w-3.5 h-3.5" />
                <span>Onboard Project</span>
              </Button>
            }
          />

          <Card className="shadow-xs overflow-hidden">
            <DataTable
              columns={[
                {
                  key: "name",
                  header: "Project Name & Key",
                  cell: (p) => (
                    <>
                      <div className="font-semibold text-xs text-foreground">{p.name}</div>
                      <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1.5">
                        <span>ID: {p.key || p.id}</span>
                        {p.description && <span>· {p.description}</span>}
                      </div>
                    </>
                  ),
                },
                {
                  key: "department",
                  header: "Department",
                  cellClassName: "text-xs text-muted-foreground",
                  cell: (p) => p.department || "Engineering",
                },
                {
                  key: "stage",
                  header: "Stage",
                  cell: (p) => (
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono ${
                        p.stage === "PROD"
                          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
                          : p.stage === "TEST"
                          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400"
                          : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-400"
                      }`}
                    >
                      {p.stage || "DEV"}
                    </Badge>
                  ),
                },
                {
                  key: "cloud",
                  header: "Cloud Infrastructure",
                  cell: (p) =>
                    p.cloudProvider && p.cloudProvider !== "NONE" ? (
                      <Badge variant="outline" className="text-[10px] gap-1 font-mono">
                        <Cloud className="w-3 h-3 text-primary" />
                        <span>{p.cloudProvider}</span>
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Standard / None</span>
                    ),
                },
                {
                  key: "members",
                  header: "Members",
                  cellClassName: "text-xs font-medium text-foreground",
                  cell: (p) => (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 text-[11px]">
                      <Users className="w-3 h-3" />
                      {p.membersCount ?? (p.members?.length || 1)} user(s)
                    </span>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (p) => {
                    const isActive = (p.status || "ACTIVE") === "ACTIVE";
                    return (
                      <Badge
                        className={`text-[10px] ${
                          isActive
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {isActive ? "ACTIVE" : "DISABLED"}
                      </Badge>
                    );
                  },
                },
                {
                  key: "actions",
                  header: "Actions",
                  headClassName: "text-xs font-semibold text-right",
                  cellClassName: "text-right",
                  cell: (p) => {
                    const isActive = (p.status || "ACTIVE") === "ACTIVE";
                    return (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[11px] gap-1"
                          disabled={!canManageEnterprise}
                          title={!canManageEnterprise ? "Only Tenant Super Admin can configure project members" : undefined}
                          onClick={() => {
                            setSelectedProjectForMember(p);
                            setAssignMemberOpen(true);
                          }}
                        >
                          <UserPlus className="w-3 h-3" />
                          <span>Assign</span>
                        </Button>
                        <Button
                          variant={isActive ? "ghost" : "outline"}
                          size="sm"
                          className={`h-7 px-2 text-[11px] gap-1 ${
                            isActive
                              ? "text-destructive hover:bg-destructive/10"
                              : "text-emerald-600 hover:bg-emerald-50"
                          }`}
                          onClick={() => handleToggleProjectStatus(p)}
                        >
                          <Power className="w-3 h-3" />
                          <span>{isActive ? "Deactivate" : "Activate"}</span>
                        </Button>
                      </div>
                    );
                  },
                },
              ]}
              rows={projects}
              rowKey={(p) => p.id}
              rowClassName="hover:bg-muted/20"
              emptyMessage={'No enterprise projects created yet. Click "Onboard Project" to define your first project boundary.'}
            />
          </Card>
        </TabsContent>

        {/* ── 2. USERS TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="users" className="space-y-4">
          <SectionHeader
            title="Tenant User Directory"
            description="Manage accounts, job titles, employee IDs, and multi-project assignments. End users cannot log in without assigned projects."
            action={
              <Button size="sm" onClick={() => handleTabChange("add-user")} className="gap-1.5 text-xs h-8">
                <UserPlus className="w-3.5 h-3.5" />
                <span>Invite User</span>
              </Button>
            }
          />

          <Card className="shadow-xs overflow-hidden">
            <DataTable
              columns={[
                {
                  key: "user",
                  header: "User / Name",
                  cell: (u) => {
                    const fullName = u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email.split("@")[0];
                    return (
                      <>
                        <div className="font-semibold text-xs text-foreground">{fullName}</div>
                        <div className="text-[11px] font-mono text-muted-foreground">{u.email}</div>
                      </>
                    );
                  },
                },
                {
                  key: "title",
                  header: "Title & Department",
                  cellClassName: "text-xs text-muted-foreground",
                  cell: (u) => (
                    <>
                      <div className="font-medium text-foreground">{u.title || "Platform User"}</div>
                      <div className="text-[11px]">{u.department || "Technology"}</div>
                    </>
                  ),
                },
                {
                  key: "employeeId",
                  header: "Employee ID",
                  cellClassName: "text-xs font-mono text-muted-foreground",
                  cell: (u) => u.employeeId || "—",
                },
                {
                  key: "roles",
                  header: "Assigned Roles",
                  cell: (u) => (
                    <div className="flex gap-1 flex-wrap">
                      {(u.roles || []).map((r) => (
                        <Badge key={r} variant="outline" className="text-[10px] font-mono">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  ),
                },
                {
                  key: "projects",
                  header: "Assigned Projects",
                  cell: (u) => {
                    const assigned = (u.assignedProjectIds || [])
                      .map((pid) => projects.find((p) => p.id === pid))
                      .filter(Boolean) as TenantProject[];
                    return (
                      <div className="flex gap-1 flex-wrap max-w-xs">
                        {assigned.length > 0 ? (
                          assigned.map((p) => (
                            <Badge key={p.id} variant="secondary" className="text-[10px] gap-1">
                              <FolderGit2 className="w-2.5 h-2.5" />
                              <span>{p.name}</span>
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-red-600 border-red-200 bg-red-50 dark:bg-red-950/20">
                            0 Projects (Login Blocked)
                          </Badge>
                        )}
                      </div>
                    );
                  },
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (u) => (
                    <Badge
                      className={`text-[10px] ${
                        (u.status || "ACTIVE") === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {u.status || "ACTIVE"}
                    </Badge>
                  ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  headClassName: "text-xs text-right",
                  cellClassName: "text-right",
                  cell: (u) => {
                    const isSelf = user?.id === u.id;
                    const isActive = (u.status || "ACTIVE") === "ACTIVE";
                    return (
                      <div className="flex items-center justify-end">
                        <Button
                          variant={isActive ? "ghost" : "outline"}
                          size="sm"
                          className={`h-7 px-2 text-[11px] gap-1 ${
                            isActive
                              ? "text-destructive hover:bg-destructive/10"
                              : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                          }`}
                          disabled={loading || !canManageEnterprise || isSelf}
                          title={
                            !canManageEnterprise
                              ? "Only Tenant Super Admin can manage user accounts"
                              : isSelf
                              ? "You cannot deactivate your own account"
                              : undefined
                          }
                          onClick={() => handleToggleUserStatus(u)}
                        >
                          <Power className="w-3 h-3" />
                          <span>{isActive ? "Deactivate" : "Activate"}</span>
                        </Button>
                      </div>
                    );
                  },
                },
              ]}
              rows={users}
              rowKey={(u) => u.id}
              rowClassName="hover:bg-muted/20"
              emptyMessage={'No tenant users provisioned yet. Click "Onboard User" to provision team accounts.'}
            />
          </Card>
        </TabsContent>

        {/* ── 3. SCM & CLOUD INTEGRATIONS TAB ─────────────────────────────── */}
        <TabsContent value="integrations" className="space-y-6">
          <SectionHeader
            title="Clickable SCM & Cloud Connectors"
            description="Click on any source control or cloud provider card below to launch its configuration modal and register live scanning pipelines."
          />

          {/* Section A: SCM Repositories */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <GitFork className="w-4 h-4 text-primary" />
              <span>Source Code Management (SCM)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {scmProviders.map((provider) => (
                <div
                  key={provider.id}
                  onClick={() => openIntegrationModal(provider)}
                  className="group cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-transform">
                        <GitBranch className="w-5 h-5" />
                      </div>
                      <Badge variant="outline" className="text-[9px] group-hover:border-primary/40 group-hover:text-primary">
                        Configure &rarr;
                      </Badge>
                    </div>
                    <div className="font-semibold text-sm text-foreground">{provider.name}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{provider.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section B: Cloud & Infrastructure */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Cloud className="w-4 h-4 text-primary" />
              <span>Cloud & Infrastructure Exposure</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {cloudProviders.map((provider) => (
                <div
                  key={provider.id}
                  onClick={() => openIntegrationModal(provider)}
                  className="group cursor-pointer rounded-xl border border-border bg-card p-4 hover:border-primary/50 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Cloud className="w-5 h-5" />
                      </div>
                      <Badge variant="outline" className="text-[9px] group-hover:border-primary/40 group-hover:text-primary">
                        Configure &rarr;
                      </Badge>
                    </div>
                    <div className="font-semibold text-sm text-foreground">{provider.name}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{provider.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Configured Integrations Table */}
          <div className="space-y-3 pt-4 border-t border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Active Configured Integrations ({integrations.length})
            </h4>
            <Card className="shadow-xs overflow-hidden">
              <DataTable
                columns={[
                  {
                    key: "name",
                    header: "Integration Name",
                    cellClassName: "font-medium text-xs text-foreground",
                    cell: (int) => int.name,
                  },
                  {
                    key: "provider",
                    header: "Provider",
                    cell: (int) => (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {int.provider}
                      </Badge>
                    ),
                  },
                  {
                    key: "project",
                    header: "Scoped Project",
                    cellClassName: "text-xs text-muted-foreground",
                    cell: (int) => {
                      const scoped = projects.find((p) => p.id === int.projectId);
                      return scoped ? (
                        <span className="font-medium text-foreground">{scoped.name}</span>
                      ) : (
                        <span>Tenant-wide (All Projects)</span>
                      );
                    },
                  },
                  {
                    key: "status",
                    header: "Status",
                    cell: (int) => (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{int.status || "ACTIVE"}</span>
                      </span>
                    ),
                  },
                  {
                    key: "actions",
                    header: "Actions",
                    headClassName: "text-xs font-semibold text-right",
                    cellClassName: "text-right",
                    cell: (int) => (
                      <div className="flex items-center justify-end gap-1.5">
                        {((int.type || "").toUpperCase() === "SCM" ||
                          ["GITHUB", "GITLAB", "BITBUCKET", "CODECOMMIT"].includes(
                            (int.provider || int.type || "").toUpperCase()
                          )) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-xs gap-1.5 border-purple-500/30 text-purple-700 dark:text-purple-400 hover:bg-purple-500/10"
                            disabled={loading}
                            onClick={() => openRepoScanModal(int)}
                          >
                            <GitFork className="w-3 h-3 text-purple-600" />
                            <span>Repos & Scan</span>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-xs gap-1.5"
                          disabled={loading}
                          onClick={() => handleTestIntegration(int.id)}
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Test</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1 text-destructive hover:bg-destructive/10"
                          disabled={loading || !canManageEnterprise}
                          title={!canManageEnterprise ? "Only Tenant Super Admin can delete integrations" : undefined}
                          onClick={() => handleDeleteIntegration(int.id, int.name)}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </Button>
                      </div>
                    ),
                  },
                ]}
                rows={integrations}
                rowKey={(int) => int.id}
                rowClassName="hover:bg-muted/20"
                emptyMessage="No active integrations yet. Click on any provider card above to configure a connector."
                emptyClassName="text-center py-8 text-xs text-muted-foreground"
              />
            </Card>
          </div>
        </TabsContent>

        {/* ── 4. AUDIT LOGS TAB ────────────────────────────────────────────── */}
        <TabsContent value="audit" className="space-y-4">
          <SectionHeader
            title="Tenant Isolated Audit Trail"
            description="Immutable compliance events recorded strictly inside this tenant&apos;s Secure Database Partition."
          />

          {!canViewAudit ? (
            <Alert className="border-amber-500/20 bg-amber-500/5 text-amber-500">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle className="font-semibold text-xs">Audit Access Required</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground mt-1">
                Viewing immutable tenant audit trails requires the <span className="font-mono">audit:read</span> permission
                (granted to Tenant Super Admin and Security Manager).
              </AlertDescription>
            </Alert>
          ) : (
            <Card className="shadow-xs overflow-hidden">
              <DataTable
                columns={[
                  {
                    key: "timestamp",
                    header: "Timestamp",
                    cellClassName: "text-xs font-mono text-muted-foreground",
                    cell: (log) => (log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"),
                  },
                  {
                    key: "action",
                    header: "Action",
                    cell: (log) => (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {log.action}
                      </Badge>
                    ),
                  },
                  {
                    key: "resource",
                    header: "Resource",
                    cellClassName: "text-xs text-foreground",
                    cell: (log) => (log.resourceType ? `${log.resourceType}:${log.resourceId || ""}` : "system"),
                  },
                  {
                    key: "actor",
                    header: "Actor / User ID",
                    cellClassName: "text-xs font-mono text-muted-foreground",
                    cell: (log) => log.actor?.userId || log.userId || "system",
                  },
                  {
                    key: "metadata",
                    header: "Metadata",
                    cellClassName: "text-xs font-mono text-muted-foreground truncate max-w-xs",
                    cell: (log) => (log.details ? JSON.stringify(log.details) : "—"),
                  },
                ]}
                rows={auditLogs}
                rowKey={(log) => log.id}
                rowClassName="hover:bg-muted/20"
                emptyMessage="No audit events recorded yet."
              />
            </Card>
          )}
        </TabsContent>
        {/* ── 3. ASSETS TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="assets" className="space-y-4">
          <SectionHeader
            className="flex-col sm:flex-row items-start sm:items-center gap-3"
            title={
              <span className="flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" />
                <span>Asset Inventory & Security Perimeter</span>
              </span>
            }
            description="Unified security catalog of physical, cloud, container, and application assets linked to vulnerability scanning projects."
            action={
              <Button size="sm" onClick={() => handleTabChange("onboard-asset")} className="gap-1.5 text-xs h-8">
                <Plus className="w-3.5 h-3.5" />
                <span>Onboard Asset</span>
              </Button>
            }
          />

          {/* Asset Search & Filter Toolbar (Req 21) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-muted/30 p-3 rounded-lg border border-border">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search name, IP, host, owner..."
                value={assetSearchQuery}
                onChange={(e) => setAssetSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>

            <div>
              <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="All Asset Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Asset Types</SelectItem>
                  <SelectItem value="server" className="text-xs">Server / Host</SelectItem>
                  <SelectItem value="container" className="text-xs">Container / Image</SelectItem>
                  <SelectItem value="database" className="text-xs">Database Engine</SelectItem>
                  <SelectItem value="webapp" className="text-xs">Web Application</SelectItem>
                  <SelectItem value="cloud_vm" className="text-xs">Cloud VM Instance</SelectItem>
                  <SelectItem value="repository" className="text-xs">Source Code Repository</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={assetCriticalityFilter} onValueChange={setAssetCriticalityFilter}>
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="All Criticality Tiers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Criticality Tiers</SelectItem>
                  <SelectItem value="1" className="text-xs">Tier 1 (Mission-Critical)</SelectItem>
                  <SelectItem value="2" className="text-xs">Tier 2 (High)</SelectItem>
                  <SelectItem value="3" className="text-xs">Tier 3 (Medium)</SelectItem>
                  <SelectItem value="4" className="text-xs">Tier 4 (Low)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={assetExposureFilter} onValueChange={setAssetExposureFilter}>
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="All Exposure Profiles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Exposure Profiles</SelectItem>
                  <SelectItem value="internet" className="text-xs">Internet-Facing</SelectItem>
                  <SelectItem value="internal" className="text-xs">Internal Network</SelectItem>
                  <SelectItem value="air_gapped" className="text-xs">Air-Gapped / Isolated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assets Inventory Table */}
          <Card className="shadow-xs overflow-hidden">
            <DataTable
              columns={[
                {
                  key: "name",
                  header: "Asset Name & Platform",
                  cell: (asset) => (
                    <>
                      <div className="font-semibold text-xs text-foreground">{asset.name}</div>
                      <div className="text-[11px] font-mono text-muted-foreground flex items-center gap-1.5">
                        <span>{asset.platform || "linux"}</span>
                        {asset.owner && <span>· Owner: {asset.owner}</span>}
                      </div>
                    </>
                  ),
                },
                {
                  key: "type",
                  header: "Type",
                  cell: (asset) => (
                    <Badge variant="outline" className="text-[10px] font-mono uppercase">
                      {asset.type || "server"}
                    </Badge>
                  ),
                },
                {
                  key: "environment",
                  header: "Environment",
                  cell: (asset) => (
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize ${
                        asset.environment === "production"
                          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
                          : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-400"
                      }`}
                    >
                      {asset.environment || "production"}
                    </Badge>
                  ),
                },
                {
                  key: "criticality",
                  header: "Criticality",
                  cell: (asset) => (
                    <Badge
                      className={`text-[10px] ${
                        String(asset.criticality) === "1"
                          ? "bg-red-500 text-white"
                          : String(asset.criticality) === "2"
                          ? "bg-amber-500 text-white"
                          : "bg-slate-600 text-white"
                      }`}
                    >
                      Tier {asset.criticality || 1}
                    </Badge>
                  ),
                },
                {
                  key: "exposure",
                  header: "Exposure",
                  cell: (asset) => (
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                        asset.exposure === "internet" ? "text-red-600" : "text-blue-600"
                      }`}
                    >
                      {asset.exposure === "internet" ? "Internet-Facing" : asset.exposure === "air_gapped" ? "Air-Gapped" : "Internal"}
                    </span>
                  ),
                },
                {
                  key: "address",
                  header: "Network Address",
                  cellClassName: "text-xs font-mono text-muted-foreground",
                  cell: (asset) => asset.ipAddress || asset.hostname || "—",
                },
                {
                  key: "project",
                  header: "Project Scope",
                  cellClassName: "text-xs text-foreground",
                  cell: (asset) => {
                    const scoped = projects.find((p) => p.id === asset.projectId);
                    return scoped ? scoped.name : <span className="text-muted-foreground">Tenant-wide</span>;
                  },
                },
                {
                  key: "actions",
                  header: "Actions",
                  headClassName: "text-xs font-semibold text-right",
                  cellClassName: "text-right",
                  cell: (asset) => (
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 gap-1"
                        onClick={() => setAssetToDelete({ id: asset.id, name: asset.name })}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Decommission</span>
                      </Button>
                    </div>
                  ),
                },
              ]}
              rows={filteredAssets}
              rowKey={(asset) => asset.id}
              rowClassName="hover:bg-muted/20"
              emptyMessage={
                assets.length === 0
                  ? 'No assets onboarded yet. Click "Onboard Asset" to register your infrastructure.'
                  : "No assets match your search or filter criteria."
              }
            />
          </Card>
        </TabsContent>

        {/* ── ONBOARD ASSET (IN-LAYOUT FORM) ──────────────────────────────── */}
        <TabsContent value="onboard-asset" className="space-y-4">
          {/* Active Clickable Breadcrumbs */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button onClick={() => handleTabChange("overview")} className="hover:text-foreground transition-colors flex items-center gap-1">
              <Building className="w-3.5 h-3.5" />
              <span>Tenant Admin</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
            <button onClick={() => handleTabChange("assets")} className="hover:text-foreground transition-colors">
              Asset Management
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
            <span className="font-semibold text-foreground">Onboard Asset</span>
          </div>

          <div className="flex items-center justify-between pb-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleTabChange("assets")}
              className="gap-1.5 text-xs h-8 -ml-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Asset Inventory</span>
            </Button>
          </div>

          <Card className="max-w-3xl shadow-sm border border-border">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                <span>Onboard Security Asset</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Register a new infrastructure or application asset with granular metadata to link with vulnerability scans and projects.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleOnboardAsset} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Asset Name" required>
                    <Input
                      required
                      placeholder="e.g. prod-api-cluster-node-01"
                      value={assetName}
                      onChange={(e) => setAssetName(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </Field>

                  <Field label="Asset Type" required>
                    <Select value={assetType} onValueChange={setAssetType}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select asset type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="server" className="text-xs">Server / Host</SelectItem>
                        <SelectItem value="container" className="text-xs">Container / Image</SelectItem>
                        <SelectItem value="database" className="text-xs">Database Engine</SelectItem>
                        <SelectItem value="webapp" className="text-xs">Web Application</SelectItem>
                        <SelectItem value="cloud_vm" className="text-xs">Cloud VM Instance</SelectItem>
                        <SelectItem value="repository" className="text-xs">Source Code Repository</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Environment">
                    <Select value={assetEnvironment} onValueChange={setAssetEnvironment}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Environment" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="production" className="text-xs">Production (PROD)</SelectItem>
                        <SelectItem value="staging" className="text-xs">Staging / UAT</SelectItem>
                        <SelectItem value="development" className="text-xs">Development (DEV)</SelectItem>
                        <SelectItem value="testing" className="text-xs">Testing / QA</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Criticality Tier">
                    <Select value={assetCriticality} onValueChange={setAssetCriticality}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Criticality" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1" className="text-xs">Tier 1 - Mission Critical</SelectItem>
                        <SelectItem value="2" className="text-xs">Tier 2 - High Priority</SelectItem>
                        <SelectItem value="3" className="text-xs">Tier 3 - Medium Priority</SelectItem>
                        <SelectItem value="4" className="text-xs">Tier 4 - Low Priority</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Network Exposure">
                    <Select value={assetExposure} onValueChange={setAssetExposure}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Exposure" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internet" className="text-xs">Internet-Facing (Public)</SelectItem>
                        <SelectItem value="internal" className="text-xs">Internal Network (Private)</SelectItem>
                        <SelectItem value="air_gapped" className="text-xs">Air-Gapped / Isolated</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Primary IP Address / CIDR">
                    <Input
                      placeholder="e.g. 10.0.4.15 or 192.168.1.0/24"
                      value={assetIpAddress}
                      onChange={(e) => setAssetIpAddress(e.target.value)}
                      className="h-9 text-xs font-mono"
                    />
                  </Field>

                  <Field label="Hostname / FQDN">
                    <Input
                      placeholder="e.g. api-worker-01.internal.corp"
                      value={assetHostname}
                      onChange={(e) => setAssetHostname(e.target.value)}
                      className="h-9 text-xs font-mono"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Asset Owner / Custodian">
                    <Input
                      placeholder="e.g. SecOps / Alice Smith"
                      value={assetOwner}
                      onChange={(e) => setAssetOwner(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </Field>

                  <Field label="Project Scope">
                    <Select value={assetProjectId} onValueChange={setAssetProjectId}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Tenant-wide (All Projects)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="" className="text-xs">Tenant-wide (All Projects)</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.name} ({p.key || p.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Platform / Operating System">
                    <Select value={assetPlatform} onValueChange={setAssetPlatform}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="linux" className="text-xs">Linux (Ubuntu/RHEL/Debian)</SelectItem>
                        <SelectItem value="windows" className="text-xs">Windows Server</SelectItem>
                        <SelectItem value="macos" className="text-xs">macOS</SelectItem>
                        <SelectItem value="kubernetes" className="text-xs">Kubernetes Cluster</SelectItem>
                        <SelectItem value="docker" className="text-xs">Docker Engine</SelectItem>
                        <SelectItem value="aws" className="text-xs">AWS EC2 / ECS</SelectItem>
                        <SelectItem value="azure" className="text-xs">Azure VM / AKS</SelectItem>
                        <SelectItem value="gcp" className="text-xs">Google Compute Engine</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label="Description & Business Function">
                  <Input
                    placeholder="Brief description of workloads and data handled by this asset..."
                    value={assetDescription}
                    onChange={(e) => setAssetDescription(e.target.value)}
                    className="h-9 text-xs"
                  />
                </Field>

                <Field label="Tags & Labels (Comma-separated)" hint={<>Tags allow automated grouping during vulnerability reports, compliance audits, and posture assessments.</>}>
                  <Input
                    placeholder="e.g. payment-gateway, pci-dss, tier-1-critical, nginx"
                    value={assetTags}
                    onChange={(e) => setAssetTags(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </Field>

                <FormActions
                  submitLabel="Onboard Security Asset"
                  onCancel={() => handleTabChange("assets")}
                  loading={loading}
                />
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CREATE PROJECT (IN-LAYOUT FORM) ─────────────────────────────── */}
        <TabsContent value="add-project" className="space-y-4">
          {/* Active Clickable Breadcrumbs */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button onClick={() => handleTabChange("overview")} className="hover:text-foreground transition-colors flex items-center gap-1">
              <Building className="w-3.5 h-3.5" />
              <span>Tenant Admin</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
            <button onClick={() => handleTabChange("overview")} className="hover:text-foreground transition-colors">
              Projects
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
            <span className="font-semibold text-foreground">Create Project</span>
          </div>

          <div className="flex items-center justify-between pb-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleTabChange("overview")}
              className="gap-1.5 text-xs h-8 -ml-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Projects Overview</span>
            </Button>
          </div>

          <Card className="max-w-3xl shadow-sm border border-border">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderGit2 className="w-5 h-5 text-primary" />
                <span>Create Enterprise Project</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Establish an isolated security boundary for vulnerability scans, SBOMs, and team members.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleCreateProject} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Project Name" required>
                    <Input
                      required
                      placeholder="e.g. Core Payment Gateway"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </Field>

                  <Field label="Project Code / Key" required>
                    <Input
                      required
                      placeholder="e.g. PRJ-PAY"
                      value={projectKey}
                      onChange={(e) => setProjectKey(e.target.value)}
                      className="h-9 text-xs uppercase font-mono"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Department / Organization Unit">
                    <Input
                      placeholder="e.g. Engineering / FinTech"
                      value={projectDepartment}
                      onChange={(e) => setProjectDepartment(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </Field>

                  <Field label="Project Stage">
                    <Select value={projectStage} onValueChange={setProjectStage}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Stage" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DEV" className="text-xs">Development (DEV)</SelectItem>
                        <SelectItem value="TEST" className="text-xs">Testing / QA (TEST)</SelectItem>
                        <SelectItem value="PROD" className="text-xs">Production (PROD)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Start Date">
                    <Input
                      type="date"
                      value={projectStartDate}
                      onChange={(e) => setProjectStartDate(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </Field>
                  <Field label="Target End / Release Date">
                    <Input
                      type="date"
                      value={projectEndDate}
                      onChange={(e) => setProjectEndDate(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </Field>
                </div>

                <Field label="Description & Objectives">
                  <Input
                    placeholder="High-level description of business context..."
                    value={projectDesc}
                    onChange={(e) => setProjectDesc(e.target.value)}
                    className="h-9 text-xs"
                  />
                </Field>

                {/* Cloud Provider Dropdown & Conditional Fields */}
                <div className="border border-border rounded-lg p-3.5 bg-muted/20 space-y-3">
                  <Field label="Cloud or Infrastructure Hosting">
                    <Select value={projectCloudProvider} onValueChange={setProjectCloudProvider}>
                      <SelectTrigger className="h-9 text-xs bg-background">
                        <SelectValue placeholder="Select cloud provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE" className="text-xs">None / Standard Local Codebase</SelectItem>
                        <SelectItem value="AWS" className="text-xs">Amazon Web Services (AWS)</SelectItem>
                        <SelectItem value="AZURE" className="text-xs">Microsoft Azure</SelectItem>
                        <SelectItem value="GCP" className="text-xs">Google Cloud Platform (GCP)</SelectItem>
                        <SelectItem value="ON_PREM" className="text-xs">On-Premises / Private Datacenter</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  {projectCloudProvider === "AWS" && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <Field label="AWS Account ID" labelClassName="text-[11px] font-medium text-muted-foreground mb-1.5">
                        <Input
                          placeholder="123456789012"
                          value={awsAccountId}
                          onChange={(e) => setAwsAccountId(e.target.value)}
                          className="h-8 text-xs bg-background"
                        />
                      </Field>
                      <Field label="AWS Region" labelClassName="text-[11px] font-medium text-muted-foreground mb-1.5">
                        <Input
                          placeholder="us-east-1"
                          value={awsRegion}
                          onChange={(e) => setAwsRegion(e.target.value)}
                          className="h-8 text-xs bg-background"
                        />
                      </Field>
                      <Field label="IAM Role ARN" labelClassName="text-[11px] font-medium text-muted-foreground mb-1.5">
                        <Input
                          placeholder="arn:aws:iam::..."
                          value={awsRoleArn}
                          onChange={(e) => setAwsRoleArn(e.target.value)}
                          className="h-8 text-xs bg-background font-mono"
                        />
                      </Field>
                    </div>
                  )}

                  {projectCloudProvider === "AZURE" && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <Field label="Subscription ID" labelClassName="text-[11px] font-medium text-muted-foreground mb-1.5">
                        <Input
                          placeholder="sub-uuid-..."
                          value={azureSubscriptionId}
                          onChange={(e) => setAzureSubscriptionId(e.target.value)}
                          className="h-8 text-xs bg-background"
                        />
                      </Field>
                      <Field label="Tenant ID" labelClassName="text-[11px] font-medium text-muted-foreground mb-1.5">
                        <Input
                          placeholder="tenant-uuid-..."
                          value={azureTenantId}
                          onChange={(e) => setAzureTenantId(e.target.value)}
                          className="h-8 text-xs bg-background"
                        />
                      </Field>
                      <Field label="Resource Group" labelClassName="text-[11px] font-medium text-muted-foreground mb-1.5">
                        <Input
                          placeholder="rg-production"
                          value={azureResourceGroup}
                          onChange={(e) => setAzureResourceGroup(e.target.value)}
                          className="h-8 text-xs bg-background"
                        />
                      </Field>
                    </div>
                  )}

                  {projectCloudProvider === "GCP" && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <Field label="GCP Project ID" labelClassName="text-[11px] font-medium text-muted-foreground mb-1.5">
                        <Input
                          placeholder="gcp-security-prod"
                          value={gcpProjectId}
                          onChange={(e) => setGcpProjectId(e.target.value)}
                          className="h-8 text-xs bg-background"
                        />
                      </Field>
                      <Field label="Region" labelClassName="text-[11px] font-medium text-muted-foreground mb-1.5">
                        <Input
                          placeholder="us-central1"
                          value={gcpRegion}
                          onChange={(e) => setGcpRegion(e.target.value)}
                          className="h-8 text-xs bg-background"
                        />
                      </Field>
                      <Field label="Service Account" labelClassName="text-[11px] font-medium text-muted-foreground mb-1.5">
                        <Input
                          placeholder="sa@project.iam..."
                          value={gcpServiceAccount}
                          onChange={(e) => setGcpServiceAccount(e.target.value)}
                          className="h-8 text-xs bg-background font-mono"
                        />
                      </Field>
                    </div>
                  )}

                  {projectCloudProvider === "ON_PREM" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <Field label="Cluster Host / IP" labelClassName="text-[11px] font-medium text-muted-foreground mb-1.5">
                        <Input
                          placeholder="https://cluster.internal:6443"
                          value={onPremClusterHost}
                          onChange={(e) => setOnPremClusterHost(e.target.value)}
                          className="h-8 text-xs bg-background"
                        />
                      </Field>
                      <Field label="Datacenter Location" labelClassName="text-[11px] font-medium text-muted-foreground mb-1.5">
                        <Input
                          placeholder="DC-East-Rack-4"
                          value={onPremDatacenter}
                          onChange={(e) => setOnPremDatacenter(e.target.value)}
                          className="h-8 text-xs bg-background"
                        />
                      </Field>
                    </div>
                  )}
                </div>

                {/* Assign Initial Team Members */}
                {users.length > 0 && (
                  <Field label="Assign Initial Team Members">
                    <div className="border border-border rounded-lg p-3 max-h-36 overflow-y-auto space-y-1.5 bg-muted/10">
                      {users.map((u) => (
                        <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded hover:bg-muted/40">
                          <input
                            type="checkbox"
                            checked={projectMembers.includes(u.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setProjectMembers([...projectMembers, u.id]);
                              } else {
                                setProjectMembers(projectMembers.filter((id) => id !== u.id));
                              }
                            }}
                            className="rounded accent-primary"
                          />
                          <span className="font-medium text-foreground">{u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email}</span>
                          <span className="text-[10px] text-muted-foreground">({u.title || u.roles?.[0]})</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                )}

                <FormActions
                  submitLabel="Create Enterprise Project"
                  onCancel={() => handleTabChange("overview")}
                  loading={loading}
                />
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── INVITE USER (IN-LAYOUT FORM) ────────────────────────────────── */}
        <TabsContent value="add-user" className="space-y-4">
          {/* Active Clickable Breadcrumbs */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button onClick={() => handleTabChange("overview")} className="hover:text-foreground transition-colors flex items-center gap-1">
              <Building className="w-3.5 h-3.5" />
              <span>Tenant Admin</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
            <button onClick={() => handleTabChange("users")} className="hover:text-foreground transition-colors">
              Team & Users
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
            <span className="font-semibold text-foreground">Invite User</span>
          </div>

          <div className="flex items-center justify-between pb-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleTabChange("users")}
              className="gap-1.5 text-xs h-8 -ml-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Users Directory</span>
            </Button>
          </div>

          <Card className="max-w-2xl shadow-sm border border-border">
            <CardHeader className="border-b border-border/40 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                <span>Invite & Provision Tenant User</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Create an isolated user account with role-based access and assign project boundaries.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="First Name" required>
                    <Input
                      required
                      placeholder="e.g. Alex"
                      value={userFirstName}
                      onChange={(e) => setUserFirstName(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </Field>
                  <Field label="Last Name" required>
                    <Input
                      required
                      placeholder="e.g. Mercer"
                      value={userLastName}
                      onChange={(e) => setUserLastName(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </Field>
                </div>

                <Field label="Work Email" required>
                  <Input
                    required
                    type="email"
                    placeholder="developer@company.com"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="h-9 text-xs"
                  />
                </Field>

                <Field label="Temporary Password" required>
                  <Input
                    required
                    type="password"
                    placeholder="Min 8 chars with uppercase & symbol"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Job Title">
                    <Input
                      placeholder="Lead Developer / SecOps"
                      value={userTitle}
                      onChange={(e) => setUserTitle(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </Field>
                  <Field label="Employee ID">
                    <Input
                      placeholder="EMP-1042"
                      value={userEmployeeId}
                      onChange={(e) => setUserEmployeeId(e.target.value)}
                      className="h-9 text-xs font-mono"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Department">
                    <Input
                      placeholder="Engineering / SecOps"
                      value={userDepartment}
                      onChange={(e) => setUserDepartment(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </Field>
                  <Field label="Access Role">
                    <Select value={userRole} onValueChange={setUserRole}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="END_USER" className="text-xs">End User (Developer)</SelectItem>
                        <SelectItem value="TENANT_ADMIN" className="text-xs">Tenant Admin</SelectItem>
                        <SelectItem value="TENANT_SUPER_ADMIN" className="text-xs">Tenant Super Admin</SelectItem>
                        <SelectItem value="SECURITY_MANAGER" className="text-xs">Security Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {/* Assigned Projects Multi-Select */}
                <Field label="Assign To Projects" required hint={<>Note: Users cannot log in or run vulnerability scans without at least one assigned project scope.</>}>
                  <div className="border border-border rounded-lg p-3 max-h-36 overflow-y-auto space-y-1.5 bg-muted/10">
                    {projects.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground p-1">
                        No enterprise projects available. Please create a project first!
                      </p>
                    ) : (
                      projects.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded hover:bg-muted/40">
                          <input
                            type="checkbox"
                            checked={userSelectedProjects.includes(p.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setUserSelectedProjects([...userSelectedProjects, p.id]);
                              } else {
                                setUserSelectedProjects(userSelectedProjects.filter((id) => id !== p.id));
                              }
                            }}
                            className="rounded accent-primary"
                          />
                          <span className="font-medium text-foreground">{p.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">({p.key || p.stage})</span>
                        </label>
                      ))
                    )}
                  </div>
                </Field>

                <FormActions
                  submitLabel="Provision User"
                  onCancel={() => handleTabChange("users")}
                  loading={loading}
                />
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── CONFIRM: Decommission Asset ─────────────────────────────────────── */}
      <ConfirmDialog
        open={assetToDelete !== null}
        onOpenChange={(next) => !next && setAssetToDelete(null)}
        title="Decommission asset?"
        description={
          <>
            <span className="font-semibold text-foreground">{assetToDelete?.name}</span> will be
            permanently removed from the security perimeter. Historical scan findings are retained.
          </>
        }
        confirmLabel="Decommission"
        destructive
        loading={loading}
        onConfirm={() => assetToDelete && handleDeleteAsset(assetToDelete.id)}
      />

      {/* ── DIALOG 3: Assign Member To Project ─────────────────────────────── */}
      <Dialog open={assignMemberOpen} onOpenChange={setAssignMemberOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              <span>Assign Member to {selectedProjectForMember?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Grant project membership so the user can view findings and submit SBOM scans for this project.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAssignMember} className="space-y-3 pt-2">
            <Field label="Select User" labelClassName="mb-1">
              <Select value={selectedUserForAssign} onValueChange={setSelectedUserForAssign}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose user to assign" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs">
                      {u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Project Role" labelClassName="mb-1">
              <Select value={memberRoleForAssign} onValueChange={setMemberRoleForAssign}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER" className="text-xs">Member (Scan & Findings)</SelectItem>
                  <SelectItem value="ADMIN" className="text-xs">Project Lead / Admin</SelectItem>
                  <SelectItem value="VIEWER" className="text-xs">Read-Only Viewer</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAssignMemberOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={loading || !selectedUserForAssign} className="gap-1.5">
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Assignment</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG 4: Interactive Integration Connector Modal ──────────────── */}
      <Dialog open={integrationModalOpen} onOpenChange={setIntegrationModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-primary" />
              <span>Configure {activeIntegrationProvider?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {activeIntegrationProvider?.description}. All credentials are encrypted and stored in tenant database.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveIntegration} className="space-y-3 pt-2">
            <Field label="Integration Name" labelClassName="mb-1">
              <Input
                required
                value={intName}
                onChange={(e) => setIntName(e.target.value)}
                className="h-8 text-xs"
              />
            </Field>

            <Field label="Scoped Project (Optional)" labelClassName="mb-1">
              <Select value={intTargetProjectId} onValueChange={setIntTargetProjectId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Tenant-wide (All Projects)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="" className="text-xs">Tenant-wide (All Projects)</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name} ({p.key || p.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Provider-specific field rendering */}
            {activeIntegrationProvider?.id === "github" && (
              <>
                <Field label="GitHub Organization / Owner" labelClassName="mb-1">
                  <Input
                    required
                    placeholder="e.g. acme-corp"
                    value={intField1}
                    onChange={(e) => setIntField1(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Personal Access Token (PAT) / App Key" labelClassName="mb-1">
                  <Input
                    required
                    type="password"
                    placeholder="ghp_••••••••••••••••••••••••"
                    value={intField2}
                    onChange={(e) => setIntField2(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="Webhook Secret (Optional)" labelClassName="mb-1">
                  <Input
                    type="password"
                    placeholder="••••••••••••"
                    value={intField3}
                    onChange={(e) => setIntField3(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
              </>
            )}

            {activeIntegrationProvider?.id === "gitlab" && (
              <>
                <Field label="GitLab Host URL" labelClassName="mb-1">
                  <Input
                    required
                    placeholder="https://gitlab.com or https://gitlab.internal"
                    value={intField1}
                    onChange={(e) => setIntField1(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Access Token" labelClassName="mb-1">
                  <Input
                    required
                    type="password"
                    placeholder="glpat-••••••••••••"
                    value={intField2}
                    onChange={(e) => setIntField2(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="Group / Project Path" labelClassName="mb-1">
                  <Input
                    placeholder="acme-corp/backend-services"
                    value={intField4}
                    onChange={(e) => setIntField4(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
              </>
            )}

            {activeIntegrationProvider?.id === "bitbucket" && (
              <>
                <Field label="Workspace ID" labelClassName="mb-1">
                  <Input
                    required
                    placeholder="acme-workspace"
                    value={intField1}
                    onChange={(e) => setIntField1(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="App Password" labelClassName="mb-1">
                  <Input
                    required
                    type="password"
                    placeholder="••••••••••••"
                    value={intField2}
                    onChange={(e) => setIntField2(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
              </>
            )}

            {activeIntegrationProvider?.id === "codecommit" && (
              <>
                <Field label="AWS Account ID" labelClassName="mb-1">
                  <Input
                    required
                    placeholder="123456789012"
                    value={intField1}
                    onChange={(e) => setIntField1(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="AWS Access Key ID" labelClassName="mb-1">
                  <Input
                    required
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    value={intField2}
                    onChange={(e) => setIntField2(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="AWS Secret Access Key" labelClassName="mb-1">
                  <Input
                    required
                    type="password"
                    placeholder="••••••••••••"
                    value={intField3}
                    onChange={(e) => setIntField3(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="AWS Region" labelClassName="mb-1">
                  <Input
                    placeholder="us-east-1"
                    value={intField4}
                    onChange={(e) => setIntField4(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
              </>
            )}

            {activeIntegrationProvider?.id === "aws_cloud" && (
              <>
                <Field label="AWS Account ID" labelClassName="mb-1">
                  <Input
                    required
                    placeholder="123456789012"
                    value={intField1}
                    onChange={(e) => setIntField1(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="IAM Access Key ID / Role ARN" labelClassName="mb-1">
                  <Input
                    required
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    value={intField2}
                    onChange={(e) => setIntField2(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="IAM Secret Key" labelClassName="mb-1">
                  <Input
                    required
                    type="password"
                    placeholder="••••••••••••"
                    value={intField3}
                    onChange={(e) => setIntField3(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="AWS Region" labelClassName="mb-1">
                  <Input
                    placeholder="us-east-1"
                    value={intField4}
                    onChange={(e) => setIntField4(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
              </>
            )}

            {activeIntegrationProvider?.id === "azure_cloud" && (
              <>
                <Field label="Azure Subscription ID" labelClassName="mb-1">
                  <Input
                    required
                    placeholder="sub-uuid-..."
                    value={intField1}
                    onChange={(e) => setIntField1(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Client ID (App ID)" labelClassName="mb-1">
                  <Input
                    required
                    placeholder="client-uuid-..."
                    value={intField2}
                    onChange={(e) => setIntField2(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="Client Secret" labelClassName="mb-1">
                  <Input
                    required
                    type="password"
                    placeholder="••••••••••••"
                    value={intField3}
                    onChange={(e) => setIntField3(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="Tenant ID" labelClassName="mb-1">
                  <Input
                    placeholder="tenant-uuid-..."
                    value={intField4}
                    onChange={(e) => setIntField4(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
              </>
            )}

            {activeIntegrationProvider?.id === "gcp_cloud" && (
              <>
                <Field label="GCP Project ID" labelClassName="mb-1">
                  <Input
                    required
                    placeholder="gcp-production-project"
                    value={intField1}
                    onChange={(e) => setIntField1(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Service Account Key (JSON)" labelClassName="mb-1">
                  <textarea
                    required
                    rows={3}
                    placeholder='{"type": "service_account", "project_id": ...}'
                    value={intField2}
                    onChange={(e) => setIntField2(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg p-2 text-xs font-mono focus:outline-none focus:ring-1"
                  />
                </Field>
                <Field label="Region" labelClassName="mb-1">
                  <Input
                    placeholder="us-central1"
                    value={intField4}
                    onChange={(e) => setIntField4(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
              </>
            )}

            {activeIntegrationProvider?.id === "onprem_agent" && (
              <>
                <Field label="Agent Host / Cluster URL" labelClassName="mb-1">
                  <Input
                    required
                    placeholder="https://scanner-agent.internal:8443"
                    value={intField1}
                    onChange={(e) => setIntField1(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
                <Field label="Agent Secret Token" labelClassName="mb-1">
                  <Input
                    required
                    type="password"
                    placeholder="agt_••••••••••••"
                    value={intField2}
                    onChange={(e) => setIntField2(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </Field>
                <Field label="Datacenter / Cluster ID" labelClassName="mb-1">
                  <Input
                    placeholder="DC-East-Cluster-1"
                    value={intField4}
                    onChange={(e) => setIntField4(e.target.value)}
                    className="h-8 text-xs"
                  />
                </Field>
              </>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIntegrationModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={loading} className="gap-1.5">
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Connector</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* SCM Repository Browser & Trigger Scan Modal (R5) */}
      <Dialog open={repoModalOpen} onOpenChange={setRepoModalOpen}>
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <FolderGit2 className="w-5 h-5 text-purple-600" />
              <span>Repositories & Vulnerability Scan</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {activeRepoIntegration
                ? `Trigger on-demand vulnerability scan for repositories connected to ${activeRepoIntegration.name}.`
                : "Select repository to scan."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleTriggerRepoScan} className="space-y-4 pt-2">
            <Field label="Target Project Scope" required>
              <Select value={scanProjectId} onValueChange={setScanProjectId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select target project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name} ({p.key || p.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Connected Repository" required>
              {isFetchingRepos ? (
                <div className="flex items-center gap-2 p-2 border border-border rounded-md text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                  <span>Fetching repository list from connector...</span>
                </div>
              ) : availableRepos.length > 0 ? (
                <Select
                  value={selectedRepoId}
                  onValueChange={(val) => {
                    setSelectedRepoId(val);
                    const repo = availableRepos.find((r) => r.id === val || r.name === val);
                    if (repo?.defaultBranch) setScanBranch(repo.defaultBranch);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select repository" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRepos.map((repo) => (
                      <SelectItem key={repo.id} value={repo.id} className="text-xs">
                        {repo.fullName || repo.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  required
                  placeholder="e.g. organization/repository-name"
                  value={selectedRepoId}
                  onChange={(e) => setSelectedRepoId(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Branch / Ref">
                <Input
                  value={scanBranch}
                  onChange={(e) => setScanBranch(e.target.value)}
                  placeholder="main"
                  className="h-8 text-xs font-mono"
                />
              </Field>
              <Field label="Manifest Path (Optional)">
                <Input
                  value={scanManifestPath}
                  onChange={(e) => setScanManifestPath(e.target.value)}
                  placeholder="package.json or /pom.xml"
                  className="h-8 text-xs font-mono"
                />
              </Field>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setRepoModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isScanTriggering || !selectedRepoId}
                className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isScanTriggering && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Trigger Vulnerability Scan</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
