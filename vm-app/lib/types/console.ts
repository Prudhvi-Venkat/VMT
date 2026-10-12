/** Console view/model types shared by the shell and the extracted view components. */

export type ConsoleView = "overview" | "findings" | "assets" | "scans";

export const CONSOLE_VIEWS: ConsoleView[] = ["overview", "findings", "assets", "scans"];

export type ConsoleProject = {
  id: string;
  name: string;
  key?: string;
  stage?: string;
  cloudProvider?: string;
};

/** Live scan progress payload rendered by the scan progress banner. */
export interface ActiveScanProgress {
  scanId?: string;
  stage: string;
  percentage: number;
  filename: string;
  totalComponents?: number;
  processedComponents?: number;
}

export type ExportFormat = "csv" | "excel";
