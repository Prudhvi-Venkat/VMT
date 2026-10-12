import { ArrowUpRight, ChevronRight, FileCode2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { FindingTable } from "./finding-table";
import type { Asset, ConsoleView, Finding, SbomScan } from "@/lib/types";

interface OverviewViewProps {
  findings: Finding[];
  open: Finding[];
  visibleFindings: Finding[];
  assets: Asset[];
  scans: SbomScan[];
  onNavigate: (view: ConsoleView) => void;
  onSelectFinding: (finding: Finding) => void;
  onViewCve: (finding: Finding) => void;
}

/** Exposure overview: risk KPIs, priority findings, and scan posture. */
export function OverviewView({
  findings,
  open,
  visibleFindings,
  assets,
  scans,
  onNavigate,
  onSelectFinding,
  onViewCve,
}: OverviewViewProps) {
  const criticalCount = findings.filter((f) => f.risk_band === "critical").length;
  const highCount = findings.filter((f) => f.risk_band === "high").length;
  const productionAssets = assets.filter((a) => a.environment === "production").length;
  const risk = open.length
    ? Math.round(open.reduce((sum, item) => sum + item.risk_score, 0) / open.length)
    : 0;
  const breached = open.filter((item) => new Date(item.sla_due_at) < new Date()).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            A clear view of where remediation effort matters most across registered manifests and infrastructure.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/80">
            Universal vulnerability intelligence synced with CVE, CVSS v3.1, EPSS, and CISA KEV.
          </p>
        </div>
        <Button onClick={() => onNavigate("scans")}>
          <Upload size={15} />
          Scan an SBOM / Manifest
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          size="lg"
          label="Composite Risk"
          value={risk}
          note="Average open finding risk"
        />
        <StatCard
          size="lg"
          label="Open Findings"
          value={open.length}
          note={`${criticalCount} critical · ${highCount} high`}
        />
        <StatCard
          size="lg"
          label="SLA Breaches"
          value={breached}
          note="Require owner attention"
        />
        <StatCard
          size="lg"
          label="Assets Monitored"
          value={assets.length}
          note={`${productionAssets} production assets`}
        />
      </div>

      <div className="space-y-6">
        {/* Priority Findings - Full Width eliminates column overlap */}
        <Card className="w-full shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Priority Findings</CardTitle>
                <CardDescription>
                  Highest contextual risk across active projects
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("findings")}
                className="gap-1.5 text-xs font-semibold text-primary"
              >
                View all <ArrowUpRight size={14} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <FindingTable
              findings={visibleFindings.slice(0, 5)}
              onSelect={onSelectFinding}
              onViewCve={onViewCve}
            />
          </CardContent>
        </Card>

        {/* Scan Posture & Manifest Coverage */}
        <Card className="w-full shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Scan Posture</CardTitle>
                <CardDescription>
                  Recent package manifests and SBOM coverage across monitored projects
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate("scans")}
                className="gap-1.5 text-xs font-semibold text-primary"
              >
                Open Scanner <ChevronRight size={14} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scans.slice(0, 3).map((scan) => (
                <button
                  key={scan.id}
                  onClick={() => onNavigate("scans")}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary/40 hover:bg-muted/30"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <FileCode2 size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {scan.filename}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {scan.component_count} components ·{" "}
                      {scan.vulnerable_count} findings
                    </div>
                  </div>
                  <ChevronRight
                    size={15}
                    className="text-muted-foreground shrink-0"
                  />
                </button>
              ))}
              <div
                onClick={() => onNavigate("scans")}
                className="cursor-pointer rounded-lg border border-dashed border-border p-3 text-center bg-muted/20 hover:border-primary/40 transition flex items-center justify-center gap-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <Upload size={16} />
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-foreground">
                    Upload manifest / SBOM
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    CycloneDX · SPDX · package.json
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
