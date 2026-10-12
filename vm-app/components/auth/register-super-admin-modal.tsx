"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  Building2,
  User,
  Layers,
  Sparkles,
} from "lucide-react";
import {Dialog, DialogContent, DialogTitle, DialogDescription} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRegisterTenantSuperAdminMutation } from "@/lib/store/api";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/shared/form-field";

interface RegisterSuperAdminModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RegisterSuperAdminModal({
  open,
  onOpenChange,
  onSuccess,
}: RegisterSuperAdminModalProps) {
  const { toast } = useToast();
  const [registerTenantSuperAdmin] = useRegisterTenantSuperAdminMutation();

  const [tenantName, setTenantName] = useState("");
  const [tenantKey, setTenantKey] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [industry, setIndustry] = useState("SaaS & Cloud Computing");
  const [cloudProvider, setCloudProvider] = useState("AWS");
  const [complianceFramework, setComplianceFramework] = useState("SOC 2 Type II");
  const [initialAssetTarget, setInitialAssetTarget] = useState("Production Kubernetes & Microservices");
  const [scanPolicy, setScanPolicy] = useState("Enforce CISA KEV SLAs & Strict SemVer");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setTenantName(val);
    if (!tenantKey || tenantKey === tenantName.toLowerCase().replace(/[^a-z0-9_-]/g, "_")) {
      setTenantKey(val.toLowerCase().replace(/[^a-z0-9_-]/g, "_"));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!tenantName.trim()) {
      setError("Organization / Tenant Name is required");
      return;
    }
    if (!tenantKey.trim()) {
      setError("Tenant identifier slug is required");
      return;
    }
    if (!adminEmail.trim()) {
      setError("Work email address is required");
      return;
    }
    if (adminPassword.length < 8) {
      setError("Master password must be at least 8 characters long");
      return;
    }
    if (adminPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      await registerTenantSuperAdmin({
        tenantName: tenantName.trim(),
        tenantKey: tenantKey.trim().toLowerCase(),
        adminName: adminName.trim() || "Tenant Super Admin",
        adminEmail: adminEmail.trim().toLowerCase(),
        adminPassword,
        environment: cloudProvider,
        cloudProvider,
        complianceFramework,
      }).unwrap();

      toast.success(
        "Tenant Provisioned Successfully",
        `Organization "${tenantName}" created. Super Admin account is ready.`
      );

      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to register organization super admin";
      setError(msg);
      toast.error("Registration Failed", msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 border-border bg-card">
        {/* Modal Header */}
        <div className="p-6 border-b border-border bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                Register Tenant Super Admin
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Provision a dedicated multi-tenant domain and configure security scanning governance
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <Alert variant="destructive" className="py-2.5 text-xs">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Section 1: Organization & Tenant Domain */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-border text-xs font-semibold text-primary uppercase tracking-wider">
              <Building2 className="h-3.5 w-3.5" />
              <span>1. Organization & Domain Isolation</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Organization / Tenant Name" required htmlFor="tenantName" className="space-y-2">
                <Input
                  id="tenantName"
                  placeholder="e.g. Acme Cybersecurity Corp"
                  value={tenantName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  className="h-9 text-xs"
                  disabled={isLoading}
                />
              </Field>

              <Field label="Tenant Slug Identifier" required htmlFor="tenantKey" className="space-y-2" hint={<>Unique partition identifier for tenant resources.</>}>
                <Input
                  id="tenantKey"
                  placeholder="e.g. acme_cybersecurity"
                  value={tenantKey}
                  onChange={(e) => setTenantKey(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "_"))}
                  required
                  className="h-9 text-xs font-mono"
                  disabled={isLoading}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Industry Vertical" htmlFor="industry" className="space-y-2">
                <select
                  id="industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  disabled={isLoading}
                >
                  <option value="SaaS & Cloud Computing">SaaS & Cloud Computing</option>
                  <option value="Financial Services & FinTech">Financial Services & FinTech</option>
                  <option value="Healthcare & Life Sciences">Healthcare & Life Sciences</option>
                  <option value="E-Commerce & Retail">E-Commerce & Retail</option>
                  <option value="Critical Infrastructure">Critical Infrastructure</option>
                  <option value="Government & Defense">Government & Defense</option>
                </select>
              </Field>

              <Field label="Cloud Infrastructure" htmlFor="cloudProvider" className="space-y-2">
                <select
                  id="cloudProvider"
                  value={cloudProvider}
                  onChange={(e) => setCloudProvider(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  disabled={isLoading}
                >
                  <option value="AWS">Amazon Web Services (AWS)</option>
                  <option value="Azure">Microsoft Azure</option>
                  <option value="GCP">Google Cloud Platform (GCP)</option>
                  <option value="Multi-Cloud">Multi-Cloud Hybrid</option>
                  <option value="On-Premises">On-Premises Private Cloud</option>
                </select>
              </Field>

              <Field label="Compliance Baseline" htmlFor="complianceFramework" className="space-y-2">
                <select
                  id="complianceFramework"
                  value={complianceFramework}
                  onChange={(e) => setComplianceFramework(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  disabled={isLoading}
                >
                  <option value="SOC 2 Type II">SOC 2 Type II</option>
                  <option value="ISO/IEC 27001">ISO/IEC 27001</option>
                  <option value="FedRAMP High">FedRAMP High</option>
                  <option value="PCI-DSS v4.0">PCI-DSS v4.0</option>
                  <option value="HIPAA Security Rule">HIPAA Security Rule</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Section 2: Super Admin Account */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-border text-xs font-semibold text-primary uppercase tracking-wider">
              <User className="h-3.5 w-3.5" />
              <span>2. Tenant Super Admin Identity</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Super Admin Full Name" htmlFor="adminName" className="space-y-2">
                <Input
                  id="adminName"
                  placeholder="e.g. Alex Vance"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="h-9 text-xs"
                  disabled={isLoading}
                />
              </Field>

              <Field label="Corporate Work Email" required htmlFor="adminEmail" className="space-y-2">
                <Input
                  id="adminEmail"
                  type="email"
                  placeholder="superadmin@acme.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  required
                  className="h-9 text-xs"
                  disabled={isLoading}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Master Password" required htmlFor="adminPassword" className="space-y-2">
                <Input
                  id="adminPassword"
                  type="password"
                  placeholder="Min 8 characters"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  required
                  className="h-9 text-xs"
                  disabled={isLoading}
                />
              </Field>

              <Field label="Confirm Password" required htmlFor="confirmPassword" className="space-y-2">
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-type password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-9 text-xs"
                  disabled={isLoading}
                />
              </Field>
            </div>
          </div>

          {/* Section 3: Scanning & Asset Governance Setup */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-1 border-b border-border text-xs font-semibold text-primary uppercase tracking-wider">
              <Layers className="h-3.5 w-3.5" />
              <span>3. Scanning & Asset Governance Setup</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Initial Discovery Target" htmlFor="initialAssetTarget" className="space-y-2">
                <Input
                  id="initialAssetTarget"
                  value={initialAssetTarget}
                  onChange={(e) => setInitialAssetTarget(e.target.value)}
                  className="h-9 text-xs"
                  disabled={isLoading}
                />
              </Field>

              <Field label="Initial Policy Baseline" htmlFor="scanPolicy" className="space-y-2">
                <select
                  id="scanPolicy"
                  value={scanPolicy}
                  onChange={(e) => setScanPolicy(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  disabled={isLoading}
                >
                  <option value="Enforce CISA KEV SLAs & Strict SemVer">Enforce CISA KEV SLAs & Strict SemVer</option>
                  <option value="Standard CVSS v3.1 Thresholds (Critical >= 9.0)">Standard CVSS v3.1 Thresholds</option>
                  <option value="Zero-Tolerance High/Critical Exploit Blockers">Zero-Tolerance High/Critical Blockers</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isLoading}
              className="text-xs font-semibold gap-1.5 shadow-xs"
            >
              {isLoading ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  <span>Provisioning Tenant...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Provision & Register Super Admin</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
