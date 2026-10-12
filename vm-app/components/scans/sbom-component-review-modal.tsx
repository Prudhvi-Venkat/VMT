"use client";

import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Plus,
  Trash2,
  Package,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import type { InspectComponent } from "@/lib/types";

export interface EditableComponent extends InspectComponent {
  id: string;
  isModified?: boolean;
}

interface SbomComponentReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  fileType: string;
  initialComponents: InspectComponent[];
  onConfirm: (components: InspectComponent[]) => void;
  isStartingScan?: boolean;
  warnings?: string[];
}

const SUPPORTED_ECOSYSTEMS = [
  { value: "npm", label: "npm (Node.js)" },
  { value: "pypi", label: "PyPI (Python)" },
  { value: "maven", label: "Maven (Java)" },
  { value: "golang", label: "Go Modules" },
  { value: "rubygems", label: "RubyGems" },
  { value: "nuget", label: "NuGet (.NET)" },
  { value: "cargo", label: "Cargo (Rust)" },
  { value: "composer", label: "Composer (PHP)" },
  { value: "debian", label: "Debian / OS" },
];

export function SbomComponentReviewModal({
  isOpen,
  onClose,
  fileName,
  fileType,
  initialComponents,
  onConfirm,
  isStartingScan = false,
  warnings = [],
}: SbomComponentReviewModalProps) {
  const toEditable = (items: InspectComponent[]) => items.map((c, idx) => ({
      ...c,
      id: `comp_${idx}_${Date.now()}`,
      vendor: c.vendor || "",
      ecosystem: c.ecosystem || "npm",
      scope: c.scope || "direct",
      version: c.version || c.resolvedVersion || c.declaredVersion || c.versionConstraint || "",
    }));

  const [components, setComponents] = useState<EditableComponent[]>(() => toEditable(initialComponents));

  const [search, setSearch] = useState("");
  const [selectedEcosystemFilter, setSelectedEcosystemFilter] = useState("all");

  const filteredComponents = useMemo(() => {
    return components.filter((c) => {
      const matchesSearch =
        search === "" ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.vendor && c.vendor.toLowerCase().includes(search.toLowerCase())) ||
        (c.version || "").toLowerCase().includes(search.toLowerCase());

      const matchesEco =
        selectedEcosystemFilter === "all" ||
        c.ecosystem.toLowerCase() === selectedEcosystemFilter.toLowerCase();

      return matchesSearch && matchesEco;
    });
  }, [components, search, selectedEcosystemFilter]);

  const handleFieldChange = (id: string, field: keyof EditableComponent, value: string) => {
    setComponents((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              [field]: value,
              isModified: true,
            }
          : c
      )
    );
  };

  const handleAddRow = () => {
    const newRow: EditableComponent = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: "new-package",
      version: "1.0.0",
      vendor: "",
      ecosystem: "npm",
      scope: "direct",
      isModified: true,
    };
    setComponents((prev) => [newRow, ...prev]);
  };

  const handleDeleteRow = (id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  };

  const handleConfirm = () => {
    // Strip client helper IDs and format for API submission
    const cleanComponents: InspectComponent[] = components.map((c) => ({
      name: c.name.trim(),
      version: (c.version || "").trim(),
      declaredVersion: c.declaredVersion || (c.version || "").trim(),
      resolvedVersion: c.resolvedVersion || (/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test((c.version || "").trim()) ? (c.version || "").trim() : null),
      versionConstraint: c.versionConstraint || (c.version || "").trim(),
      vendor: c.vendor ? c.vendor.trim() : undefined,
      ecosystem: c.ecosystem,
      scope: c.scope,
      license: c.license,
      purl: c.purl,
    }));
    onConfirm(cleanComponents);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="space-y-2 pb-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  Pre-Scan Component Review
                  <Badge variant="outline" className="text-xs bg-muted/60 font-mono">
                    {components.length} components detected
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Manifest: <span className="font-semibold text-foreground">{fileName}</span> ({fileType.toUpperCase()})
                </DialogDescription>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Verify and adjust package names, version constraints, or vendor mappings extracted from your SBOM. The vulnerability matcher will prioritize your customized component parameters.
          </p>
          {warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <div className="font-semibold">Parser warnings</div>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                {warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}
        </DialogHeader>

        {/* Toolbar: Search, Filter, Add */}
        <div className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search packages, versions or vendors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
            <Select value={selectedEcosystemFilter} onValueChange={setSelectedEcosystemFilter}>
              <SelectTrigger className="w-[160px] h-9 text-xs">
                <SelectValue placeholder="All Ecosystems" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ecosystems</SelectItem>
                {SUPPORTED_ECOSYSTEMS.map((eco) => (
                  <SelectItem key={eco.value} value={eco.value}>
                    {eco.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddRow}
            className="h-9 gap-1.5 text-xs border-dashed"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Package
          </Button>
        </div>

        {/* Component Table */}
        <div className="flex-1 overflow-y-auto border rounded-md shadow-xs">
          <DataTable
            columns={[
              {
                key: "name",
                header: "Package Name",
                headClassName: "w-[28%] text-xs font-semibold",
                cellClassName: "py-1.5",
                cell: (comp) => (
                  <Input
                    value={comp.name}
                    onChange={(e) => handleFieldChange(comp.id, "name", e.target.value)}
                    className="h-8 text-xs font-mono font-medium"
                    placeholder="package-name"
                  />
                ),
              },
              {
                key: "version",
                header: "Version",
                headClassName: "w-[20%] text-xs font-semibold",
                cellClassName: "py-1.5",
                cell: (comp) => (
                  <div className="relative">
                    <Input
                      value={comp.version}
                      onChange={(e) => handleFieldChange(comp.id, "version", e.target.value)}
                      className={`h-8 text-xs font-mono ${comp.isModified ? "border-amber-400 bg-amber-50/20" : ""}`}
                      placeholder="1.0.0"
                    />
                    {comp.isModified && (
                      <span
                        className="absolute right-2 top-2 w-1.5 h-1.5 rounded-full bg-amber-500"
                        title="Modified"
                      />
                    )}
                  </div>
                ),
              },
              {
                key: "vendor",
                header: "Vendor / Org",
                headClassName: "w-[20%] text-xs font-semibold",
                cellClassName: "py-1.5",
                cell: (comp) => (
                  <Input
                    value={comp.vendor || ""}
                    onChange={(e) => handleFieldChange(comp.id, "vendor", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="e.g. apache, google"
                  />
                ),
              },
              {
                key: "ecosystem",
                header: "Ecosystem",
                headClassName: "w-[18%] text-xs font-semibold",
                cellClassName: "py-1.5",
                cell: (comp) => (
                  <Select
                    value={comp.ecosystem}
                    onValueChange={(val) => handleFieldChange(comp.id, "ecosystem", val)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_ECOSYSTEMS.map((eco) => (
                        <SelectItem key={eco.value} value={eco.value} className="text-xs">
                          {eco.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ),
              },
              {
                key: "scope",
                header: "Scope",
                headClassName: "w-[10%] text-xs font-semibold",
                cellClassName: "py-1.5",
                cell: (comp) => (
                  <Select
                    value={comp.scope || "direct"}
                    onValueChange={(val) => handleFieldChange(comp.id, "scope", val)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct" className="text-xs">Direct</SelectItem>
                      <SelectItem value="transitive" className="text-xs">Transitive</SelectItem>
                      <SelectItem value="dev" className="text-xs">Dev</SelectItem>
                    </SelectContent>
                  </Select>
                ),
              },
              {
                key: "actions",
                headClassName: "w-[4%] text-xs text-right",
                cellClassName: "py-1.5 text-right",
                cell: (comp) => (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDeleteRow(comp.id)}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                ),
              },
            ]}
            rows={filteredComponents}
            rowKey={(comp) => comp.id}
            rowClassName="hover:bg-muted/30"
            headerClassName="bg-muted/50 sticky top-0 z-10"
            headClassName=""
            emptyMessage="No components match your filter criteria."
            emptyClassName="h-32 text-center text-muted-foreground text-xs"
          />
        </div>

        {/* Footer */}
        <DialogFooter className="flex items-center justify-between border-t pt-3 mt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>
              {components.length} components will be submitted to the isolated tenant scanner
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isStartingScan}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={components.length === 0 || isStartingScan}
              className="gap-1.5 bg-primary text-primary-foreground font-semibold"
            >
              <ShieldCheck className="w-4 h-4" />
              {isStartingScan ? "Starting Scan..." : "Confirm & Start Scan"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
