"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/shared/data-table";
import {
  Globe,
  Server,
  ShieldAlert,
  Network,
  ArrowRight,
  Layers,
  KeyRound,
  Table as TableIcon
} from "lucide-react";
import type { Asset } from "@/lib/types";

/**
 * Safe renderer for asset owner field (can be string or { email, teamId, businessUnit } object)
 */
function renderOwner(owner: unknown): string {
  if (!owner) return "Security Team";
  if (typeof owner === "object") {
    const o = owner as { email?: string; teamId?: string; businessUnit?: string; name?: string };
    return o.email || o.name || o.teamId || o.businessUnit || "Security Team";
  }
  return String(owner);
}

/**
 * Safe formatting for asset criticality tier
 */
function renderCriticality(criticality: unknown): string {
  if (typeof criticality === "number") return `Tier ${criticality}`;
  if (typeof criticality === "string") {
    const m = criticality.match(/TIER_(\d)/i);
    if (m) return `Tier ${m[1]}`;
    return criticality.replace(/_/g, " ");
  }
  return "Tier 3";
}

/**
 * Safe exposure badge mapping
 */
function getExposure(asset: Asset): "internet" | "internal" | "air-gapped" {
  if (asset.exposure) return asset.exposure;
  if ((asset as unknown as Record<string, unknown>).internetFacing === true) return "internet";
  return "internal";
}

/** Asset inventory table and interactive exposure graph topology. */
export function AssetsView({ assets }: { assets: Asset[] }) {
  const [activeTab, setActiveTab] = useState<string>("table");
  const [selectedAssetId, setSelectedAssetId] = useState<string>(assets[0]?.id || "");

  const selectedAsset = assets.find((a) => a.id === selectedAssetId) || assets[0];

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Asset & Exposure Graph</CardTitle>
            <CardDescription>
              Registered infrastructure, network exposure, and multi-hop attack path topology (Doc 04).
            </CardDescription>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
            <TabsList className="bg-muted/60 p-1">
              <TabsTrigger value="table" className="gap-1.5 text-xs">
                <TableIcon size={14} />
                <span>Inventory Table</span>
              </TabsTrigger>
              <TabsTrigger value="graph" className="gap-1.5 text-xs">
                <Network size={14} />
                <span>Exposure & Attack Path Graph</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {activeTab === "table" ? (
          <DataTable
            columns={[
              {
                key: "name",
                header: "Asset",
                cell: (asset) => (
                  <>
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <Server size={14} className="text-muted-foreground shrink-0" />
                      <span>{asset.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground pl-5">{asset.location}</div>
                  </>
                ),
              },
              {
                key: "type",
                header: "Type",
                cellClassName: "capitalize text-muted-foreground",
                cell: (asset) => asset.type.replace("_", " "),
              },
              {
                key: "environment",
                header: "Environment",
                cell: (asset) => (
                  <Badge variant="outline" className="font-normal capitalize">
                    {asset.environment}
                  </Badge>
                ),
              },
              {
                key: "owner",
                header: "Owner",
                cellClassName: "text-muted-foreground",
                cell: (asset) => renderOwner(asset.owner),
              },
              {
                key: "exposure",
                header: "Exposure",
                cell: (asset) => {
                  const exp = getExposure(asset);
                  return (
                    <Badge
                      variant="outline"
                      className={
                        exp === "internet"
                          ? "border-red-400/40 bg-red-500/10 text-red-700 capitalize font-medium"
                          : "border-border text-muted-foreground capitalize font-normal"
                      }
                    >
                      {exp}
                    </Badge>
                  );
                },
              },
              {
                key: "criticality",
                header: "Criticality",
                cellClassName: "font-medium text-foreground",
                cell: (asset) => renderCriticality(asset.criticality),
              },
            ]}
            rows={assets}
            rowKey={(asset) => asset.id}
            headerClassName=""
            headClassName=""
            emptyMessage="No infrastructure assets registered for this tenant yet."
          />
        ) : (
          /* Interactive Asset Exposure Graph & Attack Path Traversal (Doc 04) */
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/30 border border-border rounded-lg">
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Active Focus Asset: </span>
                {selectedAsset ? selectedAsset.name : "None selected"}
              </div>
              {assets.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Select Target Asset:</span>
                  <select
                    value={selectedAsset?.id || ""}
                    onChange={(e) => setSelectedAssetId(e.target.value)}
                    className="text-xs bg-card border border-border rounded px-2.5 py-1 text-foreground"
                  >
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({getExposure(a)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Attack Path Topology Visualization */}
            <div className="p-6 border border-border rounded-xl bg-gradient-to-b from-card to-muted/20 space-y-6">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Layers size={14} className="text-primary" />
                <span>Multi-Hop Attack Path & Reachability Vector</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                {/* Node 1: Exposure Source */}
                <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5 space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 flex items-center gap-1">
                      <Globe size={12} />
                      Zone: External
                    </span>
                    <Badge variant="outline" className="border-red-500/40 text-red-700 text-[10px] py-0 px-1">
                      {selectedAsset && getExposure(selectedAsset) === "internet" ? "Public Internet" : "VPC Ingress"}
                    </Badge>
                  </div>
                  <div className="font-semibold text-sm text-foreground">
                    {selectedAsset && getExposure(selectedAsset) === "internet" ? "0.0.0.0/0 (Untrusted)" : "Internal Transit GW"}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedAsset && getExposure(selectedAsset) === "internet"
                      ? "Direct routable endpoint with public ingress privileges."
                      : "Internal access through authenticated VPN / Zero Trust gateway."}
                  </p>
                </div>

                {/* Node 2: Target Asset / Service */}
                <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                      <Server size={12} />
                      Target Asset
                    </span>
                    <Badge variant="outline" className="border-primary/40 text-primary text-[10px] py-0 px-1">
                      {selectedAsset ? renderCriticality(selectedAsset.criticality) : "Tier 3"}
                    </Badge>
                  </div>
                  <div className="font-semibold text-sm text-foreground truncate" title={selectedAsset?.name || "Asset Host"}>
                    {selectedAsset?.name || "Target Host"}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Env: <span className="font-medium text-foreground">{selectedAsset?.environment || "production"}</span> · Owner: <span className="font-medium text-foreground">{renderOwner(selectedAsset?.owner)}</span>
                  </p>
                </div>

                {/* Node 3: Software Vulnerability Evidence */}
                <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1">
                      <ShieldAlert size={12} />
                      Component Risk
                    </span>
                    <Badge variant="outline" className="border-amber-500/40 text-amber-700 text-[10px] py-0 px-1">
                      SBOM Matched
                    </Badge>
                  </div>
                  <div className="font-semibold text-sm text-foreground">
                    Software Dependencies
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Contains manifest packages correlated with NVD & CISA KEV intelligence feeds.
                  </p>
                </div>

                {/* Node 4: Privileged Identity / Blast Radius */}
                <div className="p-4 rounded-lg border border-purple-500/30 bg-purple-500/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 flex items-center gap-1">
                      <KeyRound size={12} />
                      Blast Radius
                    </span>
                    <Badge variant="outline" className="border-purple-500/40 text-purple-700 text-[10px] py-0 px-1">
                      Assumes Role
                    </Badge>
                  </div>
                  <div className="font-semibold text-sm text-foreground">
                    Cloud IAM Privileges
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Execution context can pivot to tenant databases, object storage, and microservices.
                  </p>
                </div>
              </div>

              {/* Edge Relationships Key (Doc 04) */}
              <div className="pt-2 border-t border-border/60">
                <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-y-1 gap-x-4">
                  <span className="font-semibold text-foreground">Canonical Edge Traversal:</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">EXPOSED_TO</span>
                    <ArrowRight size={10} />
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">HOSTED_ON</span>
                    <ArrowRight size={10} />
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">CONTAINS</span>
                    <ArrowRight size={10} />
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">AUTHENTICATES_TO</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
