import { ArrowUpRight, ChevronRight, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/data-table";
import { SeverityBadge, FindingStatusBadge } from "@/components/shared/status-badge";
import type { Finding } from "@/lib/types";

interface FindingTableProps {
  findings: Finding[];
  onSelect: (finding: Finding) => void;
  onViewCve?: (finding: Finding) => void;
}

/** Findings table with severity, risk score, signals, and status columns. */
export function FindingTable({ findings, onSelect, onViewCve }: FindingTableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <DataTable
        columns={[
          {
            key: "finding",
            header: "Finding",
            headClassName: "py-2.5 px-4 text-xs font-semibold text-muted-foreground w-[320px]",
            cellClassName: "py-2.5 px-4",
            cell: (finding) => (
              <>
                <div className="font-semibold text-sm text-foreground truncate max-w-[300px]" title={finding.title}>
                  {finding.title}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {finding.cve_id || finding.osv_id ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onViewCve) {
                          onViewCve(finding);
                        }
                      }}
                      className="font-mono text-xs font-semibold text-primary hover:underline inline-flex items-center gap-0.5"
                      title="Open CVE intelligence details"
                    >
                      <span>{finding.cve_id ?? finding.osv_id}</span>
                      <ArrowUpRight size={11} />
                    </button>
                  ) : (
                    <span className="font-mono text-xs font-medium text-foreground">Advisory</span>
                  )}
                  {finding.kev && (
                    <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-700 gap-1 text-[10px] font-bold py-0 px-1.5">
                      <Flame size={10} className="text-red-600" />
                      KEV
                    </Badge>
                  )}
                  {finding.sample && (
                    <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                      sample
                    </Badge>
                  )}
                </div>
              </>
            ),
          },
          {
            key: "severity",
            header: "Severity",
            headClassName: "py-2.5 px-3 text-xs font-semibold text-muted-foreground w-[100px]",
            cellClassName: "py-2.5 px-3",
            cell: (finding) => <SeverityBadge value={finding.risk_band} />,
          },
          {
            key: "risk",
            header: "Risk Score",
            headClassName: "py-2.5 px-3 text-xs font-semibold text-muted-foreground w-[110px]",
            cellClassName: "py-2.5 px-3",
            cell: (finding) => (
              <>
                <span className="font-bold text-sm text-foreground">{finding.risk_score}</span>
                <span className="text-muted-foreground text-xs"> / 100</span>
              </>
            ),
          },
          {
            key: "component",
            header: "Component",
            headClassName: "py-2.5 px-3 text-xs font-semibold text-muted-foreground w-[180px]",
            cellClassName: "py-2.5 px-3",
            cell: (finding) => (
              <>
                <div className="font-medium text-sm text-foreground truncate max-w-[170px]" title={finding.component_name ?? "Asset finding"}>
                  {finding.component_name ?? "Asset finding"}
                </div>
                <div className="text-xs text-muted-foreground truncate max-w-[170px]">
                  {finding.component_version ?? finding.asset_name}
                </div>
              </>
            ),
          },
          {
            key: "signals",
            header: "Security Signals",
            headClassName: "py-2.5 px-3 text-xs font-semibold text-muted-foreground w-[160px]",
            cellClassName: "py-2.5 px-3",
            cell: (finding) => (
              <div className="flex flex-col gap-0.5 text-xs">
                {finding.cvss_score !== undefined && (
                  <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                    <span className="font-semibold text-foreground">CVSS:</span> {finding.cvss_score}
                  </div>
                )}
                {finding.fixed_version && (
                  <div className="flex items-center gap-1 text-emerald-700 text-[11px] font-medium truncate max-w-[150px]">
                    <span>Fix:</span>
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] py-0 px-1 truncate">
                      {finding.fixed_version}
                    </Badge>
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            headClassName: "py-2.5 px-3 text-xs font-semibold text-muted-foreground w-[130px]",
            cellClassName: "py-2.5 px-3",
            cell: (finding) => (
              <FindingStatusBadge status={finding.status} className="text-[11px] font-medium" />
            ),
          },
          {
            key: "chevron",
            headClassName: "py-2.5 px-2 w-[40px]",
            cellClassName: "py-2.5 px-2 text-right",
            cell: () => <ChevronRight size={15} className="text-muted-foreground" />,
          },
        ]}
        rows={findings}
        rowKey={(finding) => finding.id}
        rowClassName="cursor-pointer hover:bg-muted/40 transition border-b border-border/60"
        headerClassName=""
        headerRowClassName="border-b border-border hover:bg-transparent"
        emptyMessage="No findings match the current filter criteria."
        emptyClassName="py-12 text-center text-muted-foreground"
        onRowClick={(finding) => onSelect(finding)}
      />
    </div>
  );
}
