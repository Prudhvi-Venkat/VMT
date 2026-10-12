import type { Severity } from "./types";

export function calculateRisk(input: {
  cvss?: number;
  epss?: number;
  exploit?: "none" | "poc" | "weaponized" | "kev";
  criticality?: 1 | 2 | 3 | 4;
  exposure?: "internet" | "internal" | "air-gapped";
}) {
  const cvss = Math.min(10, Math.max(0, input.cvss ?? 0));
  const epss = Math.min(1, Math.max(0, input.epss ?? 0));
  const exploit = { none: 0, poc: 8, weaponized: 12, kev: 15 }[input.exploit ?? "none"];
  const criticality = ({ 1: 10, 2: 7, 3: 4, 4: 1 } as const)[input.criticality ?? 3];
  const exposure = ({ internet: 5, internal: 2, "air-gapped": 0 } as const)[input.exposure ?? "internal"];
  const score = Math.round(Math.min(100, cvss * 5 + epss * 20 + exploit + criticality + exposure));
  return { score, band: riskBand(score), factors: { cvss: cvss * 5, epss: epss * 20, exploit, criticality, exposure } };
}

export function riskBand(score: number): Severity {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score > 0) return "low";
  return "info";
}

export function slaHours(severity: Severity) {
  return { critical: 1, high: 4, medium: 24, low: 72, info: 168 }[severity];
}

