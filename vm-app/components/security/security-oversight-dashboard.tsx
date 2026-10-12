"use client";

import { useMemo } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CloudUpload,
  RefreshCw,
  Loader2,
  Activity,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { SectionHeader } from "@/components/shared/section-header";
import { SeverityBadge, FindingStatusBadge } from "@/components/shared/status-badge";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import { useGetFindingsQuery, useUpdateFindingStatusMutation } from "@/lib/store/api/findings-api";
import {
  useGetScansQuery,
  useCancelScanMutation,
} from "@/lib/store/api/scans-api";
import { useGetTenantDashboardQuery } from "@/lib/store/api/dashboard-api";
import type { Finding, FindingStatus, SbomScan } from "@/lib/types";

const SCAN_STATUS_LABEL: Record<string, string> = {
  QUEUED: "Queued",
  PARSING: "Parsing",
  NORMALIZING: "Normalizing",
  MATCHING: "Matching",
  ENRICHING: "Enriching",
};

const REMEDIATION_ACTIONS: Array<{ label: string; status: FindingStatus }> = [
  { label: "In Progress", status: "in_progress" },
  { label: "Resolve", status: "closed" },
  { label: "Accept Risk", status: "accepted_risk" },
  { label: "False Positive", status: "false_positive" },
];

export function SecurityOversightDashboard() {
  const { showToast } = useToast();
  const { hasPermission } = useAuth();

  const canReadFindings = hasPermission("findings:read");
  const canReadScans = hasPermission("scans:read");
  const canRemediate = hasPermission("findings:update");
  const canCancelScans = hasPermission("scans:cancel");

  const {
    data: dashboardData,
  } = useGetTenantDashboardQuery(undefined, { skip: !canReadFindings });

  const {
    data: findings = [],
    isLoading: findingsLoading,
    isError: findingsError,
    refetch: refetchFindings,
  } = useGetFindingsQuery({ active: true, limit: 100 }, { skip: !canReadFindings });

  const {
    data: scans = [],
    isLoading: scansLoading,
    isError: scansError,
    refetch: refetchScans,
  } = useGetScansQuery({ active: true, limit: 100 }, { skip: !canReadScans });

  const [updateStatus] = useUpdateFindingStatusMutation();
  const [cancelScan] = useCancelScanMutation();

  const summary = useMemo(() => {
    if (dashboardData?.data?.findings) {
      return {
        critical: dashboardData.data.findings.severity.CRITICAL || 0,
        high: dashboardData.data.findings.severity.HIGH || 0,
        total: dashboardData.data.findings.total || 0,
        totalScans: dashboardData.data.overview?.totalScans ?? scans.length,
      };
    }
    const critical = findings.filter((f) => f.severity === "critical").length;
    const high = findings.filter((f) => f.severity === "high").length;
    return { critical, high, total: findings.length, totalScans: scans.length };
  }, [findings, scans.length, dashboardData]);

  const handleStatusChange = async (finding: Finding, status: FindingStatus) => {
    try {
      await updateStatus({
        findingId: finding.id,
        status,
        reason: "Remediation action by Security Manager",
      }).unwrap();
      showToast(`Finding updated to ${status.replace(/_/g, " ")}.`, "success");
    } catch {
      showToast("Failed to update finding status.", "error");
    }
  };

  const handleCancelScan = async (scan: SbomScan) => {
    try {
      await cancelScan(scan.id).unwrap();
      showToast("Scan cancelled.", "success");
    } catch {
      showToast("Failed to cancel scan.", "error");
    }
  };

  if (!canReadFindings && !canReadScans) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Security Oversight"
          description="Tenant-wide view of active scans and open vulnerabilities, with remediation controls."
        />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Access Restricted</AlertTitle>
          <AlertDescription>
            You do not possess the necessary read permissions (findings:read / scans:read) to view security oversight metrics.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security Oversight"
        description="Tenant-wide view of active scans and open vulnerabilities, with remediation controls."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              refetchFindings();
              refetchScans();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Scans"
          value={scansLoading ? "—" : summary.totalScans}
          icon={CloudUpload}
          iconClassName="text-rose-500"
          note="In-flight processing"
        />
        <StatCard
          label="Open Vulnerabilities"
          value={findingsLoading ? "—" : summary.total}
          icon={AlertTriangle}
          iconClassName="text-amber-500"
          note="Across the tenant"
        />
        <StatCard
          label="Critical"
          value={findingsLoading ? "—" : summary.critical}
          icon={Activity}
          iconClassName="text-red-500"
          note="Active findings"
        />
        <StatCard
          label="High"
          value={findingsLoading ? "—" : summary.high}
          icon={ShieldCheck}
          iconClassName="text-orange-500"
          note="Active findings"
        />
      </div>

      <Tabs defaultValue="findings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="findings" className="gap-2 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            Active Findings ({findings.length})
          </TabsTrigger>
          <TabsTrigger value="scans" className="gap-2 text-xs">
            <CloudUpload className="h-3.5 w-3.5 text-rose-500" />
            Active Scans ({scans.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="findings" className="space-y-3">
          <SectionHeader
            title="Active Vulnerabilities"
            description="Open, triaged, and in-progress findings across every project in the tenant."
          />
          {findingsError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Failed to load findings</AlertTitle>
              <AlertDescription>
                The active findings could not be retrieved. Try refreshing.
              </AlertDescription>
            </Alert>
          ) : findingsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading active findings…
            </div>
          ) : findings.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active vulnerabilities in this tenant.</p>
          ) : (
            <Card className="overflow-hidden py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">Severity</TableHead>
                    <TableHead>Finding</TableHead>
                    <TableHead className="hidden md:table-cell">Component</TableHead>
                    <TableHead className="w-[130px]">Status</TableHead>
                    <TableHead className="text-right">Remediation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {findings.map((finding) => (
                    <TableRow key={finding.id}>
                      <TableCell>
                        <SeverityBadge value={finding.severity} />
                      </TableCell>
                      <TableCell className="max-w-[320px] whitespace-normal">
                        <div className="text-xs font-medium text-foreground">{finding.title}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {finding.cve_id || finding.osv_id || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="text-xs">{finding.component_name || "—"}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {finding.component_version || ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <FindingStatusBadge status={finding.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {canRemediate ? (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {REMEDIATION_ACTIONS.map((action) => (
                              <Button
                                key={action.status}
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                onClick={() => handleStatusChange(finding, action.status)}
                              >
                                {action.label}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Read-only</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          {findings.length >= 100 && (
            <p className="text-[11px] text-muted-foreground">
              Showing first {findings.length} of {summary.total} active findings.
            </p>
          )}
        </TabsContent>

        <TabsContent value="scans" className="space-y-3">
          <SectionHeader
            title="Active SBOM Scans"
            description="Scans currently queued or processing within the tenant."
          />
          {scansError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Failed to load scans</AlertTitle>
              <AlertDescription>
                The active scans could not be retrieved. Try refreshing.
              </AlertDescription>
            </Alert>
          ) : scansLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading active scans…
            </div>
          ) : scans.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active scans in this tenant.</p>
          ) : (
            <Card className="overflow-hidden py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scan</TableHead>
                    <TableHead className="w-[130px]">Status</TableHead>
                    <TableHead className="w-[160px]">Progress</TableHead>
                    <TableHead className="w-[100px]">Findings</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scans.map((scan) => (
                    <TableRow key={scan.id}>
                      <TableCell className="max-w-[320px] whitespace-normal">
                        <div className="text-xs font-medium text-foreground">{scan.filename}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {scan.created_at ? new Date(scan.created_at).toLocaleString() : "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {SCAN_STATUS_LABEL[scan.status] || scan.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${scan.progress?.percentage ?? 0}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {scan.progress?.percentage ?? 0}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{scan.finding_count ?? 0}</TableCell>
                      <TableCell className="text-right">
                        {canCancelScans ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] text-destructive"
                            onClick={() => handleCancelScan(scan)}
                          >
                            Cancel
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Read-only</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {!canRemediate && (
        <Alert className="border-amber-500/20 bg-amber-500/5 text-amber-600">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle className="font-semibold text-xs">Read-only access</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground mt-1">
            Your account lacks the <span className="font-mono">findings:update</span> permission, so
            remediation controls are hidden.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
