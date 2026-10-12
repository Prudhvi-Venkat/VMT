"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function AuthGate({
  children,
  requiredPermission,
  requiredRole,
  requiredRoles,
}: {
  children: React.ReactNode;
  requiredPermission?: string;
  requiredRole?: string;
  requiredRoles?: string[];
}) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, hasPermission } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    const allowedRoles = requiredRoles || (requiredRole ? [requiredRole] : undefined);
    if (allowedRoles && !allowedRoles.some((role) => user?.roles?.includes(role))) {
      router.replace("/");
      return;
    }
    if (requiredPermission && !hasPermission(requiredPermission)) {
      router.replace("/");
    }
  }, [hasPermission, isAuthenticated, isLoading, requiredPermission, requiredRole, requiredRoles, router, user?.roles]);

  if (isLoading || !isAuthenticated) return <div className="min-h-screen bg-background" />;
  const allowedRoles = requiredRoles || (requiredRole ? [requiredRole] : undefined);
  if (allowedRoles && !allowedRoles.some((role) => user?.roles?.includes(role))) return null;
  if (requiredPermission && !hasPermission(requiredPermission)) return null;
  return <>{children}</>;
}
