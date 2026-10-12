export interface Asset {
  id: string;
  tenant_id: string;
  name: string;
  type: "server" | "cloud_instance" | "container" | "webapp" | "database";
  environment: "production" | "staging" | "development";
  criticality: 1 | 2 | 3 | 4;
  owner: string;
  exposure: "internet" | "internal" | "air-gapped";
  location: string;
  status: "active" | "pending_review" | "decommissioned";
  sample?: boolean;
}
