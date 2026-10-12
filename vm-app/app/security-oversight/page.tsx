import { Metadata } from "next";
import { AuthGate } from "@/components/auth/auth-gate";
import { AppShell } from "@/components/layout/app-shell";
import { SecurityOversightDashboard } from "@/components/security/security-oversight-dashboard";

export const metadata: Metadata = {
  title: "Security Oversight · Enterprise Multi-Tenant Platform",
  description:
    "Tenant-wide view of active SBOM scans and open vulnerabilities with remediation controls.",
};

export default function SecurityOversightPage() {
  return (
    <AuthGate
      requiredRoles={["SECURITY_MANAGER", "TENANT_SUPER_ADMIN", "TENANT_ADMIN", "PLATFORM_ADMIN"]}
    >
      <AppShell breadcrumbPage="Security Oversight">
        <SecurityOversightDashboard />
      </AppShell>
    </AuthGate>
  );
}
