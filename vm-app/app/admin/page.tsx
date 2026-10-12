import { Metadata } from "next";
import { PlatformAdminDashboard } from "@/components/admin/platform-admin-dashboard";
import { AuthGate } from "@/components/auth/auth-gate";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: "Platform Administration · Enterprise Security Platform",
  description: "Enterprise Security Exposure Platform Administrator Console and RBAC Management",
};

export default function AdminPage() {
  return (
    <AuthGate requiredRole="PLATFORM_ADMIN">
      <AppShell breadcrumbPage="Platform Admin">
        <PlatformAdminDashboard />
      </AppShell>
    </AuthGate>
  );
}
