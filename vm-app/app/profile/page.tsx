'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { AuthGate } from '@/components/auth/auth-gate';
import { AppShell } from '@/components/layout/app-shell';
import { Shield, Key, Settings, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <AuthGate>
      <AppShell breadcrumbPage="Profile">
        <div className="max-w-4xl w-full mx-auto space-y-6">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">User Profile</h2>
              <p className="text-xs text-muted-foreground">
                Your authenticated credentials, roles, and tenant isolation boundary.
              </p>
            </div>
            <Link href="/settings">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
                <Settings className="w-3.5 h-3.5" />
                <span>Account Settings</span>
              </Button>
            </Link>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 shadow-xs flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/20 text-primary font-bold text-xl flex items-center justify-center flex-shrink-0">
              {(user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-foreground">
                    {user?.name || user?.email || 'Platform User'}
                  </h3>
                  {user?.name && (
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <CheckCircle className="w-3 h-3" /> Active
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                User ID: <span className="font-mono">{user?.id || 'N/A'}</span>
              </p>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {user?.roles?.map((r) => (
                  <Badge key={r} variant="outline" className="text-xs font-mono">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <Shield className="w-4 h-4" />
                <span>Tenant Isolation Context</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="text-muted-foreground">
                  Scope: <span className="text-foreground font-medium capitalize">{user?.scope || 'tenant'}</span>
                </div>
                <div className="text-muted-foreground">
                  Tenant Key: <span className="text-foreground font-medium font-mono">{user?.tenantId || 'global'}</span>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                <Key className="w-4 h-4" />
                <span>Security & Password</span>
              </div>
              <p className="text-xs text-muted-foreground">
                To update your password or theme preferences, visit the account settings panel.
              </p>
              <Link
                href="/settings"
                className="inline-block text-xs font-medium text-primary hover:underline"
              >
                Go to Settings &rarr;
              </Link>
            </div>
          </div>
        </div>
      </AppShell>
    </AuthGate>
  );
}
