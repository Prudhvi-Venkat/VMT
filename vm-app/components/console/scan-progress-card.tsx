import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { scanStageLabel } from "@/lib/scanner-adapter";
import type { ActiveScanProgress } from "@/lib/types";

const STAGE_HINTS: Record<string, string> = {
  QUEUED: "Job dispatched to scanner queue…",
  PARSING: "Extracting components from manifest format…",
  NORMALIZING: "Normalizing package purls and versions…",
  MATCHING: "Querying vulnerability database and CISA KEV…",
  ENRICHING: "Calculating contextual risk & remediation recommendations…",
  COMPLETED: "Finalizing vulnerability intelligence…",
};

/** Live progress banner shown while an SBOM scan runs. */
export function ScanProgressCard({ progress }: { progress: ActiveScanProgress }) {
  return (
    <Card className="border-primary/40 bg-primary/5 shadow-md">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Loader2 size={20} className="animate-spin text-primary" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">
                  Scanning: {progress.filename}
                </span>
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary font-mono text-xs uppercase">
                  {scanStageLabel(progress.stage)}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {STAGE_HINTS[progress.stage]}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-mono font-bold text-primary">
              {Math.round(progress.percentage)}%
            </div>
            {progress.totalComponents ? (
              <div className="text-xs text-muted-foreground">
                {progress.processedComponents || 0} / {progress.totalComponents} packages
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-4">
          <Progress value={progress.percentage} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
}
