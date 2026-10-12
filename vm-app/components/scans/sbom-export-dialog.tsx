'use client';

import React, { useState } from 'react';
import { Download, FileJson, FileCode, Check, RefreshCw, type LucideIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useExportSbomMutation, useDownloadRawArtifactMutation } from '@/lib/store/api';

interface SbomExportDialogProps {
  isOpen: boolean;
  scanId: string | null;
  scanName?: string;
  onClose: () => void;
}

type ExportFormat = 'CYCLONEDX_JSON' | 'CYCLONEDX_XML' | 'SPDX_JSON' | 'SPDX_XML';

const FORMATS: Array<{
  id: ExportFormat;
  icon: LucideIcon;
  version: string;
  media: string;
}> = [
  { id: 'CYCLONEDX_JSON', icon: FileJson, version: 'CycloneDX 1.5', media: 'JSON Standard' },
  { id: 'CYCLONEDX_XML', icon: FileCode, version: 'CycloneDX 1.5', media: 'XML Standard' },
  { id: 'SPDX_JSON', icon: FileJson, version: 'SPDX 2.3', media: 'JSON Standard' },
  { id: 'SPDX_XML', icon: FileCode, version: 'SPDX 2.3', media: 'XML / RDF Standard' },
];

export function SbomExportDialog({ isOpen, scanId, scanName, onClose }: SbomExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('CYCLONEDX_JSON');
  const [exportSbomMutation, { isLoading: isExporting }] = useExportSbomMutation();
  const [downloadRawMutation, { isLoading: isDownloadingRaw }] = useDownloadRawArtifactMutation();
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !scanId) return null;

  const handleExport = async () => {
    setError(null);

    try {
      const blob = await exportSbomMutation({ scanId, format }).unwrap();

      const filename = `sbom-${scanId}.${format.includes('XML') ? 'xml' : 'json'}`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during SBOM export');
    }
  };

  const handleDownloadRaw = async () => {
    setError(null);
    try {
      const blob = await downloadRawMutation(scanId).unwrap();
      const filename = scanName ? scanName : `scan-${scanId}-raw-artifact`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to download original artifact from storage');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base">Standardized SBOM Export</DialogTitle>
              <DialogDescription className="text-xs">
                {scanName ? `Exporting: ${scanName}` : 'Export reviewed software bill of materials'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-lg">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Specification & Format</div>

          <div className="grid grid-cols-2 gap-3">
            {FORMATS.map((f) => {
              const selected = format === f.id;
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  className={cn(
                    'p-3.5 border-2 rounded-lg cursor-pointer transition-all flex flex-col justify-between text-left',
                    selected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <Icon className="w-5 h-5 text-primary" />
                    {selected && <Check className="w-4 h-4 text-primary" />}
                  </div>
                  <div className="mt-3">
                    <div className="font-semibold text-xs">{f.version}</div>
                    <div className="text-[11px] text-muted-foreground">{f.media}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Original uploaded file:</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDownloadingRaw}
              onClick={handleDownloadRaw}
              className="h-8 px-3 text-xs gap-1.5"
            >
              {isDownloadingRaw ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 text-purple-600" />}
              <span>Download Raw Artifact (GridFS)</span>
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="h-9 px-4 text-xs">
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            className="h-9 px-4 text-xs gap-1.5"
          >
            {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span>Generate & Download</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
