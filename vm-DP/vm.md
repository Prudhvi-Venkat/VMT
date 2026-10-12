# Vulnerability Management (VM)

## Overview

VM is the systematic process of identifying, classifying, prioritizing, remediating, and verifying
security vulnerabilities across an organization's technology assets. Enterprise VM goes beyond raw
scanning — it provides business-contextualized risk scoring, SLA-driven remediation workflows,
and continuous measurement of the organization's exposure posture.

---

## Core Capabilities

### 1. Asset Inventory & Discovery
- **Authenticated scanning**: agent-based (preferred) or agentless via credentials
- **Unauthenticated scanning**: network-level discovery for unknown assets
- Asset types: servers, VMs, containers, cloud instances, network devices, web apps, APIs, databases
- Auto-tagging: by environment (`prod/staging/dev`), business unit, criticality tier (`Tier 1–4`)
- Asset lifecycle: `discovered → inventoried → monitored → decommissioned`

### 2. Vulnerability Scanning
Scan types and their cadence:

| Scan Type              | Frequency           | Scope                          |
|------------------------|---------------------|---------------------------------|
| Network Infrastructure | Daily               | All routable assets             |
| Web Application (DAST) | On deployment + weekly | All web-facing apps          |
| Container Image        | On push + daily     | All ECR/Docker registry images  |
| Cloud Configuration    | Continuous          | AWS/Azure/GCP resources         |
| Code (SAST)            | On PR + nightly     | All source repositories         |
| Database               | Weekly              | All RDBMS and NoSQL instances   |

### 3. Risk Scoring & Prioritization
Do NOT use raw CVSS alone. Enterprise VM uses **contextualized risk scoring**:

```
Risk Score = CVSS_Base × EPSS_factor × Asset_Criticality × Exploit_Availability × Business_Context
```

**Scoring factors:**
- **CVSS Base Score** (NVD): 0–10
- **EPSS (Exploit Prediction Scoring System)**: probability of exploitation in 30 days (0–1.0)
- **Asset Criticality**: Tier 1 (1.5×), Tier 2 (1.2×), Tier 3 (1.0×), Tier 4 (0.8×)
- **Exploit Availability**: Public PoC (+1.5×), Weaponized (+2.0×), None (1.0×)
- **Business Context**: Internet-exposed (+1.3×), Internal only (1.0×), Air-gapped (0.7×)

### 4. Remediation Workflow
States: `open → assigned → in_progress → remediated → verified → closed | accepted_risk | false_positive`

Key rules:
- Auto-assign based on asset ownership tags mapped to team directory
- SLA breaches auto-escalate to team lead → CISO
- Accepted Risk requires CISO sign-off and expiry date (max 90 days for Critical)
- Verification re-scan must pass before status moves to `closed`
- False positives require analyst justification + secondary review

### 5. Patch Management Integration
- Integrate with: SCCM, Ansible, Puppet, Chef, AWS SSM, Azure Update Manager
- Patch campaigns: group vulnerabilities by patch batch → track campaign progress
- Deviation tracking: assets that miss patch window flagged for exception management

---

## Data Model

### Vulnerability Finding
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "asset_id": "uuid",
  "cve_id": "CVE-2024-XXXX",
  "cwe_id": "CWE-79",
  "title": "string",
  "description": "string",
  "severity": "critical | high | medium | low | info",
  "cvss_score": 9.8,
  "cvss_vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
  "epss_score": 0.94,
  "risk_score": 9.2,
  "asset_criticality": "tier_1",
  "exploit_available": true,
  "exploit_maturity": "weaponized | poc | none",
  "internet_exposed": true,
  "mitre_techniques": ["T1190", "T1203"],
  "affected_component": "Apache Log4j 2.14.1",
  "affected_version": "2.14.1",
  "fixed_version": "2.17.1",
  "remediation_guidance": "string",
  "status": "open | assigned | in_progress | remediated | verified | closed | accepted_risk | false_positive",
  "assigned_to": "user_uuid",
  "sla_due_date": "2025-05-20T00:00:00Z",
  "sla_breached": false,
  "first_seen": "2025-05-15T10:00:00Z",
  "last_seen": "2025-05-19T08:00:00Z",
  "created_at": "2025-05-15T10:00:00Z",
  "updated_at": "2025-05-19T08:00:00Z"
}
```

### Asset
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "hostname": "web-prod-01.example.com",
  "ip_addresses": ["10.0.1.45", "203.0.113.10"],
  "asset_type": "server | vm | container | cloud_instance | network_device | webapp | api | database",
  "os": "Ubuntu 22.04 LTS",
  "environment": "production | staging | development",
  "criticality_tier": "tier_1 | tier_2 | tier_3 | tier_4",
  "internet_exposed": true,
  "business_unit": "string",
  "owner_team": "string",
  "tags": ["web", "pci-scope", "dmz"],
  "cloud_provider": "aws | azure | gcp | none",
  "cloud_region": "us-east-1",
  "cloud_resource_id": "i-0abc123def456",
  "open_vuln_count": { "critical": 2, "high": 5, "medium": 12, "low": 8 },
  "risk_score": 8.4,
  "last_scanned": "2025-05-19T06:00:00Z",
  "status": "active | decommissioned | pending_review"
}
```

---

## Key Metrics & KPIs

| KPI                              | Formula / Description                                     |
|----------------------------------|-----------------------------------------------------------|
| Mean Time to Remediate (MTTR)    | Avg(closed_at − first_seen) per severity                  |
| SLA Compliance Rate              | (findings closed within SLA / total findings) × 100       |
| Risk Score Trend                 | Week-over-week delta of org-level composite risk score    |
| Vulnerability Density            | Open vulns / number of assets                             |
| Critical Exposure Window         | Days since first detection for open Critical findings     |
| Patch Coverage                   | % of assets with latest patches applied                  |
| Accepted Risk Volume             | Count/% of findings in accepted_risk state                |

---

## Dashboard Components

1. **Risk Score Gauge** — current vs. previous period, trend arrow
2. **Severity Breakdown** — donut chart: Critical / High / Medium / Low / Info counts
3. **SLA Breach Heatmap** — assets × severity, highlight overdue
4. **Top 10 Risky Assets** — sorted by composite risk score
5. **Vulnerability Age Distribution** — histogram: 0–7d, 8–30d, 31–90d, 90d+
6. **Remediation Velocity** — findings opened vs. closed per week (area chart)
7. **EPSS High-Risk CVEs** — list of CVEs with EPSS > 0.7 in your environment
8. **Campaign Progress** — patch campaigns with % complete and ETA

---

## Report Templates

### Executive VM Report (Monthly)
- Overall risk score and trend
- Critical/High findings summary (count, % change)
- SLA compliance rate
- Top 3 risk areas (by business unit or asset group)
- Remediation progress highlights
- Recommendations (max 3, business-language)

### Technical VM Report (Weekly)
- New vulnerabilities discovered this week
- SLA breach alerts with asset owner
- EPSS-flagged CVEs requiring immediate action
- Patch campaign status
- False positive and accepted risk log