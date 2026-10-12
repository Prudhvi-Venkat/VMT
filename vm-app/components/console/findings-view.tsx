import { ChevronDown, Download, FileCode2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FindingTable } from "./finding-table";
import type { ExportFormat, Finding } from "@/lib/types";

interface FindingsViewProps {
  query: string;
  onQueryChange: (value: string) => void;
  scope: string;
  onScopeChange: (value: string) => void;
  visibleFindings: Finding[];
  onExport: (format: ExportFormat) => void;
  onSelectFinding: (finding: Finding) => void;
  onViewCve: (finding: Finding) => void;
}

const SCOPES = [
  { value: "all", label: "All scopes" },
  { value: "production", label: "Production" },
  { value: "development", label: "Development" },
  { value: "optional", label: "Optional" },
  { value: "peer", label: "Peer" },
];

/** Finding queue: search/scope filters, export menu, and the full findings table. */
export function FindingsView({
  query,
  onQueryChange,
  scope,
  onScopeChange,
  visibleFindings,
  onExport,
  onSelectFinding,
  onViewCve,
}: FindingsViewProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3 flex-1 min-w-[280px]">
          <div className="relative min-w-[240px] flex-1">
            <Search
              className="absolute left-3 top-2.5 text-muted-foreground z-10"
              size={16}
            />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search findings, packages, CVEs, or CWEs"
              className="pl-9 bg-card"
            />
          </div>
          <div className="w-[180px]">
            <Select value={scope} onValueChange={onScopeChange}>
              <SelectTrigger className="w-full bg-card">
                <SelectValue placeholder="Select scope" />
              </SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Export Findings Menu (Req 20) */}
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 bg-card text-xs font-semibold">
                <Download size={14} />
                Export Findings
                <ChevronDown size={13} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-card border-border">
              <DropdownMenuItem
                onClick={() => onExport("csv")}
                className="cursor-pointer gap-2 text-xs font-medium text-foreground"
              >
                <FileCode2 size={14} className="text-primary" />
                <span>Export as CSV (.csv)</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onExport("excel")}
                className="cursor-pointer gap-2 text-xs font-medium text-foreground"
              >
                <Download size={14} className="text-emerald-600" />
                <span>Export for Excel (.csv)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            All Findings{" "}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({visibleFindings.length})
            </span>
          </CardTitle>
          <CardDescription>
            Deterministic vulnerability observations enriched with CVSS, EPSS, CISA KEV, and upgrade paths.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <FindingTable
            findings={visibleFindings}
            onSelect={onSelectFinding}
            onViewCve={onViewCve}
          />
        </CardContent>
      </Card>
    </>
  );
}
