"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { InspectComponent } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import type { Asset, Finding, SbomScan, FindingStatus } from "@/lib/types";
import {
  CONSOLE_VIEWS,
  type ConsoleView,
  type ExportFormat,
} from "@/lib/types";
import { AppShell } from "@/components/layout/app-shell";
import { SbomComponentReviewModal } from "@/components/scans/sbom-component-review-modal";
import { SbomExportDialog } from "@/components/scans/sbom-export-dialog";
import { ViewHeader } from "@/components/console/view-header";
import { ScanProgressCard } from "@/components/console/scan-progress-card";
import { OverviewView } from "@/components/console/overview-view";
import { FindingsView } from "@/components/console/findings-view";
import { AssetsView } from "@/components/console/assets-view";
import { ScansView } from "@/components/console/scans-view";
import { FindingSheet } from "@/components/console/finding-sheet";
import { CveDetailModal } from "@/components/console/cve-detail-modal";
import { isScanTerminal } from "@/lib/scanner-adapter";
import { scansApi } from "@/lib/store/api/scans-api";

// Redux Store Hooks & Slices
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  selectAllFindings,
  selectSelectedFinding,
  selectCveDetailFinding,
  selectSearchQuery,
  selectScopeFilter,
  selectScopedFindings,
  selectOpenFindings,
  selectFindingsLoading,
  selectFindingsError,
  setInitialFindings,
  setSelectedFinding,
  setCveDetailFinding,
  setSearchQuery,
  setScopeFilter,
  fetchTenantFindings,
  updateFindingStatusThunk,
  assignFindingThunk,
} from "@/lib/store/slices/findings-slice";
import {
  selectAllScans,
  selectScopedScans,
  selectActiveScanProgress,
  selectIsUploading,
  selectUploadMessage,
  selectIsInspecting,
  selectReviewModalOpen,
  selectReviewFile,
  selectReviewFileType,
  selectReviewComponents,
  selectReviewWarnings,
  setInitialScans,
  setActiveScanProgress,
  setReviewModalOpen,
  fetchScansThunk,
  inspectSbomThunk,
  uploadScanThunk,
} from "@/lib/store/slices/scans-slice";
import {
  selectAllAssets,
  setInitialAssets,
  fetchAssetsThunk,
} from "@/lib/store/slices/assets-slice";
import {
  selectAllProjects,
  selectSelectedProjectId,
  selectScanTargetProjectId,
  selectScanStage,
  selectProjectMembers,
  setSelectedProjectId,
  setScanTargetProjectId,
  setScanStage,
  fetchProjectsThunk,
  fetchMembersThunk,
} from "@/lib/store/slices/projects-slice";
import {
  selectActiveView,
  selectConsoleExportScan,
  setActiveView as setConsoleActiveView,
  setExportScan as setConsoleExportScan,
} from "@/lib/store/slices/console-slice";

export function VmConsole({
  initialFindings = [],
  initialAssets = [],
  initialScans = [],
}: {
  initialFindings?: Finding[];
  initialAssets?: Asset[];
  initialScans?: SbomScan[];
} = {}) {
  const dispatch = useAppDispatch();
  const {
    accessToken,
    hasPermission,
    isPlatformAdmin,
    isTenantSuperAdmin,
    isTenantAdmin,
    isSecurityManager,
  } = useAuth();
  const { showToast } = useToast();

  // Redux Selectors (Single Source of Truth)
  const findings = useAppSelector(selectAllFindings);
  const assets = useAppSelector(selectAllAssets);
  const scans = useAppSelector(selectAllScans);
  const projects = useAppSelector(selectAllProjects);
  const members = useAppSelector(selectProjectMembers);
  const selectedProjectId = useAppSelector(selectSelectedProjectId);
  const scanTargetProjectId = useAppSelector(selectScanTargetProjectId);
  const scanStage = useAppSelector(selectScanStage);
  const selected = useAppSelector(selectSelectedFinding);
  const cveDetailFinding = useAppSelector(selectCveDetailFinding);
  const query = useAppSelector(selectSearchQuery);
  const scope = useAppSelector(selectScopeFilter);
  const scopedFindings = useAppSelector(selectScopedFindings);
  const open = useAppSelector(selectOpenFindings);
  const scopedScans = useAppSelector(selectScopedScans);
  const findingsLoading = useAppSelector(selectFindingsLoading);
  const findingsError = useAppSelector(selectFindingsError);

  // Redux Scan & Inspection State
  const activeScanProgress = useAppSelector(selectActiveScanProgress);
  const uploading = useAppSelector(selectIsUploading);
  const uploadMessage = useAppSelector(selectUploadMessage);
  const inspecting = useAppSelector(selectIsInspecting);
  const reviewModalOpen = useAppSelector(selectReviewModalOpen);
  const reviewFile = useAppSelector(selectReviewFile);
  const reviewFileType = useAppSelector(selectReviewFileType);
  const reviewComponents = useAppSelector(selectReviewComponents);
  const reviewWarnings = useAppSelector(selectReviewWarnings);

  const storedActiveView = useAppSelector(selectActiveView);
  const exportScan = useAppSelector(selectConsoleExportScan);
  const searchParams = useSearchParams();

  const viewParam = searchParams.get("view");
  const activeView: ConsoleView =
    viewParam && CONSOLE_VIEWS.includes(viewParam as ConsoleView)
      ? (viewParam as ConsoleView)
      : storedActiveView;

  const setActiveView = (view: ConsoleView) => {
    dispatch(setConsoleActiveView(view));
  };

  const setExportScan = (scan: { id: string; name?: string } | null) => {
    dispatch(setConsoleExportScan(scan));
  };

  // Seed store with initial data if provided and store is empty
  useEffect(() => {
    if (initialFindings?.length > 0 && findings.length === 0) {
      dispatch(setInitialFindings(initialFindings));
    }
    if (initialAssets?.length > 0 && assets.length === 0) {
      dispatch(setInitialAssets(initialAssets));
    }
    if (initialScans?.length > 0 && scans.length === 0) {
      dispatch(setInitialScans(initialScans));
    }
  }, [dispatch, initialFindings, initialAssets, initialScans, findings.length, assets.length, scans.length]);

  // Hydrate persistent scans, findings, projects & assets from tenant database
  useEffect(() => {
    if (!accessToken) return;
    dispatch(fetchTenantFindings({ token: accessToken }));
    dispatch(fetchScansThunk(accessToken));
    dispatch(fetchProjectsThunk(accessToken));
    if (
      hasPermission("tenant:users:read") ||
      isPlatformAdmin ||
      isTenantSuperAdmin ||
      isTenantAdmin ||
      isSecurityManager
    ) {
      dispatch(fetchMembersThunk(accessToken));
    }
    dispatch(fetchAssetsThunk(accessToken));
  }, [
    dispatch,
    accessToken,
    hasPermission,
    isPlatformAdmin,
    isTenantSuperAdmin,
    isTenantAdmin,
    isSecurityManager,
  ]);

  // If user navigates to findings view and findings items are empty, trigger fetch
  useEffect(() => {
    if (activeView === "findings" && accessToken && findings.length === 0 && !findingsLoading) {
      dispatch(fetchTenantFindings({ token: accessToken }));
    }
  }, [activeView, accessToken, findings.length, findingsLoading, dispatch]);

  // Polling for active / in-progress scans
  const activeScanId =
    activeScanProgress?.scanId || scans.find((s) => !isScanTerminal(s.status))?.id;

  useEffect(() => {
    if (!accessToken || !activeScanId) return;

    const interval = setInterval(async () => {
      try {
        const scan = await dispatch(
          scansApi.endpoints.getScan.initiate(activeScanId, { forceRefetch: true })
        ).unwrap();

        if (scan) {
          if (isScanTerminal(scan.status)) {
            dispatch(setActiveScanProgress(null));
            dispatch(fetchScansThunk(accessToken));
            dispatch(fetchTenantFindings({ token: accessToken }));
            showToast({
              title: scan.status === "FAILED" ? "Scan Failed" : "Scan Completed",
              description: `Analysis for ${scan.filename || "file"} finished: ${scan.finding_count ?? 0} findings detected.`,
              type: scan.status === "FAILED" ? "error" : "success",
            });
          } else {
            dispatch(
              setActiveScanProgress({
                scanId: scan.id,
                stage: scan.progress?.stage || scan.status,
                percentage: scan.progress?.percentage || 50,
                filename: scan.filename,
                totalComponents: scan.progress?.totalComponents ?? scan.component_count,
                processedComponents: scan.progress?.processedComponents ?? 0,
              })
            );
          }
        }
      } catch (err) {
        console.error("Failed to poll scan status:", err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [accessToken, activeScanId, dispatch, showToast]);

  const visibleFindings = scopedFindings;

  /**
   * Primary upload handler:
   * Dispatches SBOM pre-scan inspection to Redux store, then opens the Review Modal.
   */
  async function handleFileSelect(files: FileList | null) {
    if (!files?.length) return;
    const file = files[0];

    // Pre-upload size check: Backend JSON body ceiling is 10 MB.
    // In base64 encoding (manifest -> base64 payload), 7.5 MB raw is ~10 MB payload.
    const MAX_FILE_SIZE = 7.5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      showToast({
        title: "File Too Large",
        description: `Selected file exceeds the maximum allowed manifest size (7.5 MB). File size: ${(file.size / (1024 * 1024)).toFixed(2)} MB.`,
        type: "error",
      });
      return;
    }

    try {
      const inspectRes = await dispatch(inspectSbomThunk({ file, token: accessToken || undefined })).unwrap();
      if (!inspectRes) {
        // Fallback to direct scan if inspection returned 0 components
        await executeScan(file, null);
      }
    } catch {
      showToast({
        title: "Inspection Warning",
        description: "Pre-scan inspection could not parse file, continuing with direct scan.",
        type: "warning",
      });
      await executeScan(file, null);
    }
  }

  /**
   * Executes full vulnerability scan with reviewed components via Redux Thunk.
   */
  async function executeScan(file: File, reviewedComponents: InspectComponent[] | null) {
    dispatch(
      setActiveScanProgress({
        stage: "QUEUED",
        percentage: 10,
        filename: file.name,
        totalComponents: reviewedComponents?.length || 0,
        processedComponents: 0,
      })
    );

    try {
      const uploadResult = (await dispatch(
        uploadScanThunk({
          params: {
            file,
            projectId: scanTargetProjectId || undefined,
            reviewedComponents: reviewedComponents || undefined,
          },
          token: accessToken || undefined,
        })
      ).unwrap()) as { scanId?: string; status?: string; message?: string } | undefined;

      const scanId = uploadResult?.scanId;

      dispatch(
        setActiveScanProgress({
          scanId,
          stage: uploadResult?.status || "QUEUED",
          percentage: 15,
          filename: file.name,
          totalComponents: reviewedComponents?.length || 0,
          processedComponents: 0,
        })
      );

      showToast({
        title: "Scan Started",
        description: `Analysis enqueued for ${file.name}.`,
        type: "success",
      });

      // Refetch scans and findings
      if (accessToken) {
        dispatch(fetchScansThunk(accessToken));
        dispatch(fetchTenantFindings({ token: accessToken }));
      }
    } catch (err) {
      dispatch(setActiveScanProgress(null));
      showToast({
        title: "Scan Failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    }
  }

  // Update finding status handler with optimistic Redux update & persistence
  async function handleUpdateFindingStatus(findingId: string, newStatus: FindingStatus, reason?: string) {
    if (!accessToken) return;

    try {
      await dispatch(updateFindingStatusThunk({
        findingId,
        newStatus,
        reason,
        token: accessToken,
      })).unwrap();

      showToast({
        title: "Status Updated",
        description: `Finding status changed to ${newStatus.replace("_", " ")}.`,
        type: "success",
      });
    } catch (err) {
      showToast({
        title: "Update Failed",
        description: err instanceof Error ? err.message : "Failed to persist finding status change.",
        type: "error",
      });
    }
  }

  // Assign finding to project or tenant member via Redux Thunk
  async function handleAssignFinding(findingId: string, assignedTo: string, assignedUserName: string) {
    if (!accessToken) return;

    try {
      await dispatch(assignFindingThunk({
        findingId,
        assignedTo,
        assignedUserName,
        token: accessToken,
      })).unwrap();

      showToast({
        title: "Finding Assigned",
        description: `Assigned to ${assignedUserName || assignedTo}.`,
        type: "success",
      });
    } catch (err) {
      showToast({
        title: "Assignment Failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    }
  }

  // Export filtered findings
  function exportFindings(format: ExportFormat) {
    if (visibleFindings.length === 0) {
      showToast({
        title: "No Findings",
        description: "There are no findings to export under the current filters.",
        type: "error",
      });
      return;
    }
    const headers = [
      "Finding ID",
      "Title",
      "CVE/OSV",
      "Severity",
      "Risk Score",
      "CVSS Score",
      "EPSS Score",
      "Package Name",
      "Installed Version",
      "Fixed Version",
      "Status",
      "Assigned To",
      "SLA Due Date",
      "CISA KEV",
    ];

    const rows = visibleFindings.map((f) => [
      `"${f.id.replace(/"/g, '""')}"`,
      `"${(f.title || "").replace(/"/g, '""')}"`,
      `"${f.cve_id || f.osv_id || "N/A"}"`,
      `"${(f.risk_band || "info").toUpperCase()}"`,
      f.risk_score,
      f.cvss_score ?? "N/A",
      f.epss_score ? `${(f.epss_score * 100).toFixed(2)}%` : "N/A",
      `"${(f.component_name || "").replace(/"/g, '""')}"`,
      `"${(f.component_version || "").replace(/"/g, '""')}"`,
      `"${(f.fixed_version || "").replace(/"/g, '""')}"`,
      `"${(f.status || "").replace("_", " ")}"`,
      `"${(f.assignedUserName || f.assignedTo || "Unassigned").replace(/"/g, '""')}"`,
      `"${f.sla_due_at || ""}"`,
      f.kev ? "YES" : "NO",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], {
      type: format === "excel" ? "application/vnd.ms-excel;charset=utf-8;" : "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vulnerability-findings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast({
      title: "Findings Exported",
      description: `Exported ${visibleFindings.length} findings to ${format.toUpperCase()} successfully.`,
      type: "success",
    });
  }

  return (
    <AppShell
      activeView={activeView}
      onViewChange={(view) => setActiveView(view as ConsoleView)}
      openFindingsCount={open.length}
    >
      <div className="space-y-6">
        <ViewHeader
          view={activeView}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onProjectChange={(id) => dispatch(setSelectedProjectId(id))}
        />

        {activeScanProgress && <ScanProgressCard progress={activeScanProgress} />}

        {activeView === "overview" && (
          <OverviewView
            findings={findings}
            open={open}
            visibleFindings={visibleFindings}
            assets={assets}
            scans={scans}
            onNavigate={setActiveView}
            onSelectFinding={(f) => dispatch(setSelectedFinding(f))}
            onViewCve={(f) => dispatch(setCveDetailFinding(f))}
          />
        )}

        {activeView === "findings" && (
          <div className="space-y-4">
            {findingsError && (
              <div className="p-4 border border-destructive/20 bg-destructive/10 text-destructive rounded-md flex items-center justify-between">
                <span className="text-sm font-medium">Failed to load findings: {findingsError}</span>
                <button
                  type="button"
                  className="px-3 py-1 bg-destructive text-destructive-foreground rounded text-xs font-semibold hover:opacity-90 transition-opacity"
                  onClick={() => accessToken && dispatch(fetchTenantFindings({ token: accessToken }))}
                >
                  Retry
                </button>
              </div>
            )}
            {findingsLoading && findings.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                Loading tenant findings...
              </div>
            ) : (
              <FindingsView
                query={query}
                onQueryChange={(q) => dispatch(setSearchQuery(q))}
                scope={scope}
                onScopeChange={(s) => dispatch(setScopeFilter(s))}
                visibleFindings={visibleFindings}
                onExport={exportFindings}
                onSelectFinding={(f) => dispatch(setSelectedFinding(f))}
                onViewCve={(f) => dispatch(setCveDetailFinding(f))}
              />
            )}
          </div>
        )}

        {activeView === "assets" && <AssetsView assets={assets} />}

        {activeView === "scans" && (
          <ScansView
            projects={projects}
            selectedProjectId={selectedProjectId}
            scanTargetProjectId={scanTargetProjectId}
            onScanTargetProjectChange={(id) => dispatch(setScanTargetProjectId(id))}
            scanStage={scanStage}
            onScanStageChange={(stage) => dispatch(setScanStage(stage))}
            uploading={uploading}
            inspecting={inspecting}
            uploadMessage={uploadMessage}
            onFileSelect={handleFileSelect}
            scans={scopedScans}
            onExportScan={(scan) => setExportScan({ id: scan.id, name: scan.filename })}
          />
        )}
      </div>

      <FindingSheet
        finding={selected}
        members={members}
        onClose={() => dispatch(setSelectedFinding(null))}
        onUpdateStatus={handleUpdateFindingStatus}
        onAssign={handleAssignFinding}
      />

      <CveDetailModal
        finding={cveDetailFinding}
        onClose={() => dispatch(setCveDetailFinding(null))}
      />

      <SbomComponentReviewModal
        key={`${reviewFile?.name || "manifest"}-${reviewComponents.length}-${reviewComponents.map((component) => `${component.name}:${component.version || component.resolvedVersion || component.declaredVersion || component.versionConstraint || ""}`).join("|")}`}
        isOpen={reviewModalOpen}
        onClose={() => dispatch(setReviewModalOpen(false))}
        fileName={reviewFile?.name || "package.json"}
        fileType={reviewFileType}
        initialComponents={reviewComponents}
        onConfirm={(customizedComponents) => {
          dispatch(setReviewModalOpen(false));
          if (reviewFile) {
            executeScan(reviewFile, customizedComponents);
          }
        }}
        isStartingScan={uploading}
        warnings={reviewWarnings}
      />

      <SbomExportDialog
        isOpen={Boolean(exportScan)}
        scanId={exportScan?.id || null}
        scanName={exportScan?.name}
        onClose={() => setExportScan(null)}
      />
    </AppShell>
  );
}
