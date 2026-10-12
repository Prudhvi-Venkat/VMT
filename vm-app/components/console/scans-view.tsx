import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Download,
  Loader2,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/shared/data-table";
import type { ConsoleProject, SbomScan } from "@/lib/types";

interface ScansViewProps {
  projects: ConsoleProject[];
  selectedProjectId: string;
  scanTargetProjectId: string;
  onScanTargetProjectChange: (projectId: string) => void;
  scanStage: string;
  onScanStageChange: (stage: string) => void;
  uploading: boolean;
  inspecting: boolean;
  uploadMessage: string;
  onFileSelect: (files: FileList | null) => void;
  scans: SbomScan[];
  onExportScan: (scan: SbomScan) => void;
}

const STAGES = [
  { value: "DEV", label: "Development (DEV)" },
  { value: "TEST", label: "Testing / Staging (TEST)" },
  { value: "PROD", label: "Production (PROD)" },
];

/** Scanner tab: manifest upload (with project/stage targeting) and scan history. */
export function ScansView({
  projects,
  selectedProjectId,
  scanTargetProjectId,
  onScanTargetProjectChange,
  scanStage,
  onScanStageChange,
  uploading,
  inspecting,
  uploadMessage,
  onFileSelect,
  scans,
  onExportScan,
}: ScansViewProps) {
  const targetValue =
    scanTargetProjectId || (selectedProjectId !== "all" ? selectedProjectId : projects[0]?.id || "");

  return (
    <>
      {projects.length === 0 ? (
        <Card className="border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20">
          <CardContent className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto text-red-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-foreground">No Projects Assigned</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Your user account is not currently assigned to any projects in this tenant. Vulnerability scanning is strictly restricted to assigned project boundaries.
            </p>
            <p className="text-xs font-semibold text-primary">
              Please contact your Tenant Super Admin to assign your user to a project.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed bg-muted/10">
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center shadow-xs max-w-2xl mx-auto">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
                <CloudUpload size={24} />
              </div>
              <h2 className="text-lg font-bold text-foreground">
                Scan a Dependency Manifest or SBOM
              </h2>
              <p className="mt-1 text-xs text-muted-foreground max-w-md">
                Upload CycloneDX (JSON/XML), SPDX (JSON/Tag-Value), Node.js (package.json, package-lock.json), Maven (pom.xml), Python (requirements.txt), or CSV lockfiles.
              </p>

              {/* Project & Stage Configuration */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 my-5 text-left border-t border-b border-border py-4">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Target Project <span className="text-red-500">*</span>
                  </label>
                  <Select value={targetValue} onValueChange={onScanTargetProjectChange}>
                    <SelectTrigger className="w-full h-8 text-xs bg-background">
                      <SelectValue placeholder="Select target project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.name} {p.key ? `(${p.key})` : ""} {p.cloudProvider && p.cloudProvider !== "NONE" ? `• ${p.cloudProvider}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Deployment Stage
                  </label>
                  <Select value={scanStage} onValueChange={onScanStageChange}>
                    <SelectTrigger className="w-full h-8 text-xs bg-background">
                      <SelectValue placeholder="Stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => (
                        <SelectItem key={s.value} value={s.value} className="text-xs">
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 transition">
                {inspecting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Inspecting Packages…</span>
                  </>
                ) : uploading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Scanning…</span>
                  </>
                ) : (
                  <>
                    <Upload size={15} />
                    <span>Choose Manifest Files</span>
                  </>
                )}
                <input
                  type="file"
                  multiple
                  accept=".json,.xml,.spdx,.txt,.csv,package.json,package-lock.json,pom.xml,requirements.txt"
                  className="sr-only"
                  disabled={uploading || inspecting}
                  onChange={(e) => onFileSelect(e.target.files)}
                />
              </label>

              {uploadMessage && (
                <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-md border border-emerald-200">
                  <CheckCircle2 size={15} />
                  {uploadMessage}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Scan History</CardTitle>
          <CardDescription>
            Universal SBOM scans evaluated with multi-source vulnerability intelligence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              {
                key: "file",
                header: "File",
                cell: (scan) => (
                  <>
                    <div className="font-semibold text-foreground">{scan.filename}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                      {scan.checksum || scan.id}
                    </div>
                  </>
                ),
              },
              {
                key: "format",
                header: "Format",
                cell: (scan) => (
                  <Badge variant="outline" className="font-mono text-[11px] uppercase">
                    {scan.format}
                  </Badge>
                ),
              },
              {
                key: "components",
                header: "Components",
                cellClassName: "font-medium text-foreground",
                cell: (scan) => scan.component_count,
              },
              {
                key: "findings",
                header: "Findings",
                cell: (scan) =>
                  scan.vulnerable_count > 0 ? (
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                      {scan.vulnerable_count} findings
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      Clean
                    </Badge>
                  ),
              },
              {
                key: "warnings",
                header: "Warnings",
                cellClassName: "text-amber-700 font-medium",
                cell: (scan) => scan.warning_count,
              },
              {
                key: "status",
                header: "Status",
                cell: (scan) => (
                  <span className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold capitalize">
                    <CheckCircle2 size={14} />
                    {scan.status.toLowerCase()}
                  </span>
                ),
              },
              {
                key: "export",
                header: "Export",
                headClassName: "text-right",
                cellClassName: "text-right",
                cell: (scan) => (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onExportScan(scan)}
                    className="h-7 px-2.5 text-xs gap-1.5 font-medium border-border hover:bg-muted"
                  >
                    <Download size={12} className="text-primary" />
                    <span>Export</span>
                  </Button>
                ),
              },
            ]}
            rows={scans}
            rowKey={(scan) => scan.id}
            headerClassName=""
            headClassName=""
          />
        </CardContent>
      </Card>
    </>
  );
}
