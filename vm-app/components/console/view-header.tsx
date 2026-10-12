import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONSOLE_VIEWS, type ConsoleProject, type ConsoleView } from "@/lib/types";

interface ViewHeaderProps {
  view: ConsoleView;
  projects: ConsoleProject[];
  selectedProjectId: string;
  onProjectChange: (projectId: string) => void;
}

const VIEW_META: Record<ConsoleView, { title: string; description: string }> = {
  overview: {
    title: "Exposure Overview",
    description: "Priority exposure analysis and risk metrics across assigned projects.",
  },
  findings: {
    title: "Finding Queue",
    description: "Normalized vulnerability findings from CVE, OSV, and CISA KEV.",
  },
  assets: {
    title: "Asset Inventory",
    description: "Monitored infrastructure assets and SBOM deployment environments.",
  },
  scans: {
    title: "Universal SBOM & Dependency Scanner",
    description: "Upload, inspect, and evaluate dependency manifests for security vulnerabilities.",
  },
};

/** Console page banner: view title + description on the left, project scope filter on the right. */
export function ViewHeader({ view, projects, selectedProjectId, onProjectChange }: ViewHeaderProps) {
  const meta = VIEW_META[view];
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{meta.title}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project Scope:</span>
        <Select value={selectedProjectId} onValueChange={onProjectChange}>
          <SelectTrigger className="w-[210px] h-8 text-xs bg-card">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All Assigned Projects ({projects.length})
            </SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                {p.name} {p.key ? `(${p.key})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** Keeps console view values in sync with the shared sidebar nav keys. */
export function isConsoleView(value: string | null): value is ConsoleView {
  return CONSOLE_VIEWS.includes(value as ConsoleView);
}
