import { Metadata } from "next";
import { TenantAdminDashboard } from "@/components/admin/tenant-admin-dashboard";
import { AuthGate } from "@/components/auth/auth-gate";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: "Tenant Administration · Enterprise Multi-Tenant Platform",
  description: "Manage tenant-isolated users, enterprise projects, SCM repositories, and immutable audit logs.",
};

export default function TenantAdminPage() {
  return (
    <AuthGate requiredRoles={["TENANT_SUPER_ADMIN", "TENANT_ADMIN"]}>
      <AppShell breadcrumbPage="Tenant Admin">
        <TenantAdminDashboard />
      </AppShell>
    </AuthGate>
  );
}
