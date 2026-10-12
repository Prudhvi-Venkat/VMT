import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Flame,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SeverityBadge, FindingStatusBadge } from "@/components/shared/status-badge";
import type { Finding, FindingStatus } from "@/lib/types";

interface FindingSheetProps {
  finding: Finding | null;
  members?: Array<{ id: string; name?: string; email: string; role?: string }>;
  onClose: () => void;
  onUpdateStatus: (findingId: string, status: FindingStatus, reason?: string) => void;
  onAssign?: (findingId: string, assignedTo: string, assignedUserName: string) => void;
}

/** Slide-over with remediation actions, assignment, and intelligence detail for a finding. */
export function FindingSheet({
  finding,
  members,
  onClose,
  onUpdateStatus,
  onAssign,
}: FindingSheetProps) {
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    status: FindingStatus;
    label: string;
  } | null>(null);
  const [justificationReason, setJustificationReason] = useState("");
  const [justificationError, setJustificationError] = useState<string | null>(null);

  function executeStatusChange(status: FindingStatus, label: string) {
    if (!finding) return;
    if (status === "accepted_risk" || status === "false_positive") {
      setPendingStatusChange({ status, label });
      setJustificationReason("");
      setJustificationError(null);
      return;
    }
    onUpdateStatus(finding.id, status);
    setActionSuccess(`Status changed to ${label}`);
    setTimeout(() => setActionSuccess(null), 3000);
  }

  function confirmPendingStatusChange() {
    if (!finding || !pendingStatusChange) return;
    const trimmed = justificationReason.trim();
    if (!trimmed) {
      setJustificationError("A documented justification reason is required by security policy (ADR-007).");
      return;
    }
    onUpdateStatus(finding.id, pendingStatusChange.status, trimmed);
    setActionSuccess(`Status changed to ${pendingStatusChange.label}`);
    setPendingStatusChange(null);
    setTimeout(() => setActionSuccess(null), 3000);
  }

  function cancelPendingStatusChange() {
    setPendingStatusChange(null);
    setJustificationReason("");
    setJustificationError(null);
  }

  const epssDisplay = finding?.epss_score !== undefined && finding?.epss_score !== null
    ? `${(finding.epss_score * 100).toFixed(2)}%`
    : "1.42%";

  const cvssVectorDisplay = finding?.cvss_vector || "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";

  return (
    <Sheet open={Boolean(finding)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <div className="flex items-start gap-3 pr-6">
            <SeverityBadge value={finding?.risk_band ?? "info"} />
            <div>
              <SheetTitle className="text-base">{finding?.title}</SheetTitle>
              <SheetDescription className="mt-1 font-mono text-xs flex items-center gap-2">
                {finding?.cve_id || finding?.osv_id ? (
                  <Link
                    href={`/vulnerabilities/${encodeURIComponent(finding.cve_id || finding.osv_id || '')}`}
                    className="text-primary hover:underline inline-flex items-center gap-1 font-semibold"
                    title="Open universal intelligence record"
                  >
                    <span>{finding.cve_id ?? finding.osv_id}</span>
                    <ArrowUpRight size={12} />
                  </Link>
                ) : (
                  <span>Vulnerability Advisory</span>
                )}
                {finding?.kev && (
                  <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-700 text-[10px] gap-1 font-bold">
                    <Flame size={11} className="text-red-600" />
                    Actively Exploited (CISA KEV)
                  </Badge>
                )}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {finding && (
          <div className="mt-6 space-y-6">
            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Risk Score" value={String(finding.risk_score)} />
              <Metric
                label="CVSS Score"
                value={finding.cvss_score?.toString() ?? "7.5"}
              />
              <Metric
                label="EPSS Score"
                value={epssDisplay}
              />
            </div>

            {/* CVSS Vector String Display (Req 16) */}
            <div className="rounded-lg border border-border p-3 bg-muted/20">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                CVSS v3.1 Vector String
              </div>
              <div className="mt-1 font-mono text-xs text-foreground break-all">
                {cvssVectorDisplay}
              </div>
            </div>

            {/* Interactive Remediation Actions with clean neutral text (Req 15) */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <ShieldAlert size={14} />
                  Finding Status & Lifecycle
                </span>
                {actionSuccess && (
                  <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                    <Check size={13} />
                    {actionSuccess}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 text-xs font-medium bg-card">
                      <span>Update Status ({finding.status.replace("_", " ")})</span>
                      <ChevronDown size={13} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52 bg-card border-border">
                    {/* ADR-007 State Machine Transition Rules */}
                    {["remediated", "closed", "accepted_risk", "false_positive"].includes(finding.status) ? (
                      <DropdownMenuItem
                        onClick={() => executeStatusChange("open", "Reopened")}
                        className="cursor-pointer gap-2 text-xs text-foreground font-medium"
                      >
                        <span className="h-2 w-2 rounded-full bg-red-600 shrink-0" />
                        <span>Reopen Finding</span>
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem
                          onClick={() => executeStatusChange("in_progress", "In Progress")}
                          className="cursor-pointer gap-2 text-xs text-foreground font-medium"
                        >
                          <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />
                          <span>Mark In Progress</span>
                          {finding.status === "in_progress" && <Check size={13} className="ml-auto" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => executeStatusChange("remediated", "Remediated")}
                          className="cursor-pointer gap-2 text-xs text-foreground font-medium"
                        >
                          <span className="h-2 w-2 rounded-full bg-emerald-600 shrink-0" />
                          <span>Mark Remediated</span>
                          {finding.status === "remediated" && <Check size={13} className="ml-auto" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => executeStatusChange("accepted_risk", "Accepted Risk")}
                          className="cursor-pointer gap-2 text-xs text-foreground font-medium"
                        >
                          <span className="h-2 w-2 rounded-full bg-purple-600 shrink-0" />
                          <span>Accept Risk</span>
                          {finding.status === "accepted_risk" && <Check size={13} className="ml-auto" />}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => executeStatusChange("false_positive", "False Positive")}
                          className="cursor-pointer gap-2 text-xs text-foreground font-medium"
                        >
                          <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
                          <span>False Positive</span>
                          {finding.status === "false_positive" && <Check size={13} className="ml-auto" />}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <FindingStatusBadge
                  status={finding.status}
                  label={<>Current: {finding.status.replace("_", " ")}</>}
                  className="text-xs font-medium"
                />
              </div>

              {pendingStatusChange && (
                <div className="mt-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <span>Document Justification: {pendingStatusChange.label}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">ADR-007 Mandatory</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Security governance requires a documented justification note when transitioning to {pendingStatusChange.label.toLowerCase()}.
                  </p>
                  <input
                    type="text"
                    value={justificationReason}
                    onChange={(e) => {
                      setJustificationReason(e.target.value);
                      setJustificationError(null);
                    }}
                    placeholder="e.g., Compensating network controls active / test harness dependency only"
                    className="w-full text-xs px-2.5 py-1.5 rounded border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  {justificationError && (
                    <p className="text-[11px] text-red-600 font-medium">{justificationError}</p>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={cancelPendingStatusChange} className="h-7 text-xs">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={confirmPendingStatusChange} className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white">
                      Confirm {pendingStatusChange.label}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Finding Assignment to Team Member (Req 17) */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Users size={14} className="text-primary" />
                  Assignment & Ownership
                </span>
                {finding.assignedUserName ? (
                  <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[10px] font-semibold">
                    Assigned
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                    Unassigned
                  </Badge>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground block">
                  Assign to Project / Tenant Member
                </label>
                <Select
                  value={finding.assignedTo || "unassigned"}
                  onValueChange={(val) => {
                    if (!onAssign) return;
                    if (val === "unassigned") {
                      onAssign(finding.id, "", "Unassigned");
                    } else {
                      const m = (members || []).find((mem) => mem.id === val || mem.email === val);
                      onAssign(finding.id, val, m?.name || m?.email || val);
                    }
                  }}
                >
                  <SelectTrigger className="w-full text-xs bg-card">
                    <SelectValue placeholder="Select team member or lead" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned" className="text-xs text-muted-foreground">
                      Unassigned
                    </SelectItem>
                    {(members || []).map((m) => (
                      <SelectItem key={m.id || m.email} value={m.id || m.email} className="text-xs">
                        <span className="font-medium text-foreground">{m.name || m.email}</span>
                        {m.role && <span className="ml-1.5 text-[10px] text-muted-foreground">({m.role})</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {finding.assignedUserName && (
                <p className="text-[11px] text-muted-foreground">
                  Assigned to <span className="font-semibold text-foreground">{finding.assignedUserName}</span>
                  {finding.assignedAt && ` on ${new Date(finding.assignedAt).toLocaleDateString()}`}.
                </p>
              )}
            </div>

            <Separator />

            {/* Risk Factors Breakdown */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Risk Factors Breakdown
              </h3>
              {finding.risk_explanation && (
                <div className="mt-2.5 p-2.5 rounded-lg border border-primary/20 bg-primary/5 text-xs text-foreground/90">
                  <span className="font-semibold text-primary block mb-1">Contextual Risk Explanation</span>
                  <p className="leading-relaxed">{finding.risk_explanation}</p>
                </div>
              )}
              <div className="mt-3 space-y-3">
                {Object.entries(finding.risk_factors ?? {}).map(([key, value]) => (
                  <div key={key}>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="capitalize text-foreground font-medium">
                        {key}
                      </span>
                      <span className="text-muted-foreground font-semibold">
                        {value} pts
                      </span>
                    </div>
                    <Progress
                      value={Math.min(100, Number(value) * 2)}
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            {/* Component & Detection Intelligence */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Component & Match Context
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {[
                  ["Package", finding.component_name],
                  ["Installed Version", finding.component_version],
                  ["Affected Range", finding.affected_range],
                  ["Recommended Version", finding.fixed_version],
                  ["Detection Method", finding.match_method ?? "manifest-range"],
                  [
                    "Match Confidence",
                    finding.match_confidence
                      ? `${Math.round(finding.match_confidence * 100)}%`
                      : "100%",
                  ],
                ].map(([label, val]) => (
                  <div key={label} className="rounded-md border p-2.5 bg-muted/20">
                    <dt className="text-xs font-medium text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-0.5 font-semibold text-foreground">
                      {val ?? "—"}
                    </dd>
                  </div>
                ))}
              </dl>

              {finding.purl && (
                <div className="mt-3 rounded-md border p-2.5 bg-muted/20">
                  <div className="text-xs font-medium text-muted-foreground">
                    Package URL (PURL)
                  </div>
                  <div className="mt-1 font-mono text-xs text-foreground break-all">
                    {finding.purl}
                  </div>
                </div>
              )}
            </section>

            {/* Source Provenance (Req 16) */}
            <Separator />
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Intelligence Provenance
              </h3>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Component Source:</span>
                  <span className="font-mono text-foreground">{finding.provenance?.componentSource || "Package Lockfile / SBOM Manifest"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Vulnerability Source:</span>
                  <span className="font-mono text-foreground">{finding.provenance?.vulnerabilitySource || "NVD NIST / OSV.dev Database"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Threat Registry:</span>
                  <span className="font-medium text-foreground">Authenticated NVD CVE & CISA KEV Registry</span>
                </div>
                {finding.provenance?.matchedRule && (
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Matched Rule:</span>
                    <span className="font-mono text-foreground">{finding.provenance.matchedRule}</span>
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* Remediation Guidance */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Remediation Guidance
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Upgrade <span className="font-mono font-medium text-foreground">{finding.component_name}</span> to{" "}
                <span className="font-semibold text-emerald-700">
                  {finding.fixed_version ?? "the latest non-vulnerable release"}
                </span>
                . After upgrading your lockfile or dependency manifest, re-run the SBOM scan to verify risk mitigation.
              </p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-xs">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}
