'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/components/theme-provider';
import { AuthGate } from '@/components/auth/auth-gate';
import { AppShell } from '@/components/layout/app-shell';
import {
  Moon,
  Sun,
  Laptop,
  Key,
  User,
  Bell,
  CheckCircle,
  AlertCircle,
  Lock,
  LogOut,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';
import { Field } from "@/components/shared/form-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { NotificationPreferences, SettingsTab } from "@/lib/types";
import {
  useGetPreferencesQuery,
  useUpdatePreferencesMutation,
  useChangePasswordMutation,
} from "@/lib/store/api/preferences-api";

const SETTINGS_TABS: Array<{
  key: SettingsTab;
  label: string;
  icon: typeof Moon;
  iconClassName: string;
}> = [
  { key: 'appearance', label: 'Appearance & Theme', icon: Moon, iconClassName: 'text-violet-500' },
  { key: 'security', label: 'Password & Security', icon: Key, iconClassName: 'text-amber-500' },
  { key: 'account', label: 'Account & Identity', icon: User, iconClassName: 'text-blue-500' },
  { key: 'notifications', label: 'Notification Preferences', icon: Bell, iconClassName: 'text-rose-500' },
];

export default function SettingsPage() {
  const { user, logout, logoutAll } = useAuth();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // RTK Query hooks
  const [changePasswordMutation, { isLoading: passwordLoading }] = useChangePasswordMutation();
  const { data: prefsData, isLoading: prefsLoading } = useGetPreferencesQuery();
  const [updatePreferencesMutation, { isLoading: prefsSaving }] = useUpdatePreferencesMutation();

  const [customPrefsDraft, setCustomPrefsDraft] = useState<Partial<NotificationPreferences> | null>(null);
  const [prefsNotice, setPrefsNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Derived preferences combining server cache with local unsaved user adjustments
  const notifPrefs: NotificationPreferences = {
    emailOnCritical:
      customPrefsDraft?.emailOnCritical ?? prefsData?.notifications?.emailOnCritical ?? true,
    emailOnScanComplete:
      customPrefsDraft?.emailOnScanComplete ?? prefsData?.notifications?.emailOnScanComplete ?? true,
    emailOnSlaBreach:
      customPrefsDraft?.emailOnSlaBreach ?? prefsData?.notifications?.emailOnSlaBreach ?? false,
  };

  // Logout all sessions state
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeSuccess, setRevokeSuccess] = useState(false);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Password validation rules
  const hasMinLength = newPassword.length >= 10;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword && newPassword.length > 0;
  const isPasswordValid = hasMinLength && hasUpper && hasLower && hasNumber && hasSpecial && passwordsMatch;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!isPasswordValid) {
      setPasswordError('Please meet all password complexity requirements and ensure passwords match.');
      return;
    }

    try {
      await changePasswordMutation({ currentPassword, newPassword }).unwrap();
      setPasswordSuccess('Password successfully updated! All other sessions have been logged out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const errMsg =
        err && typeof err === 'object' && 'data' in err && (err as { data?: { error?: { message?: string }; message?: string } }).data
          ? (err as { data?: { error?: { message?: string }; message?: string } }).data?.error?.message ||
            (err as { data?: { error?: { message?: string }; message?: string } }).data?.message ||
            'Failed to change password'
          : err instanceof Error
          ? err.message
          : 'An unexpected error occurred';
      setPasswordError(errMsg);
    }
  };

  const handleRevokeAllSessions = async () => {
    setRevokeConfirmOpen(false);
    setRevokeLoading(true);
    setRevokeError(null);
    try {
      await logoutAll();
      setRevokeSuccess(true);
      setTimeout(() => setRevokeSuccess(false), 5000);
    } catch (err: unknown) {
      setRevokeError('Failed to revoke sessions: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRevokeLoading(false);
    }
  };

  const updateNotifPref = (key: keyof NotificationPreferences, checked: boolean) => {
    setCustomPrefsDraft((prev) => ({
      ...(prev || notifPrefs),
      [key]: checked,
    }));
    setPrefsNotice(null);
  };

  const handleSavePreferences = async () => {
    try {
      await updatePreferencesMutation({
        preferences: { notifications: notifPrefs },
      }).unwrap();
      setCustomPrefsDraft(null);
      setPrefsNotice({ type: 'success', text: 'Notification preferences saved successfully.' });
    } catch (err: unknown) {
      setPrefsNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save preferences',
      });
    }
  };

  return (
    <AuthGate>
      <AppShell breadcrumbPage="Settings">
        <div className="max-w-6xl w-full mx-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Sidebar Nav */}
            <nav className="space-y-1">
              {SETTINGS_TABS.map(({ key, label, icon: Icon, iconClassName }) => {
                const isActive = activeTab === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? '' : iconClassName}`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Content Area */}
            <div className="md:col-span-3 space-y-6">
              {/* 1. APPEARANCE TAB */}
              {activeTab === 'appearance' && (
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Appearance & Theme</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Customize your console interface style. Choose between clean light aesthetics, sleek dark mode, or follow your operating system preferences.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Dark Mode Card */}
                    <div
                      onClick={() => setTheme('dark')}
                      className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center gap-3 transition-all ${theme === 'dark'
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border hover:border-border/80 hover:bg-muted/50'
                        }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-100">
                        <Moon className="w-5 h-5" />
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-sm">Dark Mode</div>
                        <div className="text-xs text-muted-foreground mt-0.5">High-contrast slate black</div>
                      </div>
                      {theme === 'dark' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                          <CheckCircle className="w-3.5 h-3.5" /> Active
                        </span>
                      )}
                    </div>

                    {/* Light Mode Card */}
                    <div
                      onClick={() => setTheme('light')}
                      className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center gap-3 transition-all ${theme === 'light'
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border hover:border-border/80 hover:bg-muted/50'
                        }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                        <Sun className="w-5 h-5" />
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-sm">Light Mode</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Crisp, clean bright style</div>
                      </div>
                      {theme === 'light' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                          <CheckCircle className="w-3.5 h-3.5" /> Active
                        </span>
                      )}
                    </div>

                    {/* System Mode Card */}
                    <div
                      onClick={() => setTheme('system')}
                      className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center gap-3 transition-all ${theme === 'system'
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border hover:border-border/80 hover:bg-muted/50'
                        }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center text-foreground">
                        <Laptop className="w-5 h-5" />
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-sm">System Default</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Matches OS settings</div>
                      </div>
                      {theme === 'system' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                          <CheckCircle className="w-3.5 h-3.5" /> Active
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Preview Box */}
                  <div className="border border-border rounded-lg p-4 bg-muted/30">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Live Component Preview</div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20">Critical (9.8)</span>
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-orange-500/10 text-orange-500 border border-orange-500/20">High (7.5)</span>
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Resolved</span>
                      <span className="px-3 py-1 rounded-md text-xs font-medium bg-primary text-primary-foreground">Primary Action</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. SECURITY & PASSWORD TAB */}
              {activeTab === 'security' && (
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Password & Authentication Security</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Manage your credentials. Updating your password invalidates all existing refresh token families across other devices.
                    </p>
                  </div>

                  {passwordSuccess && (
                    <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div>{passwordSuccess}</div>
                    </div>
                  )}

                  {passwordError && (
                    <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div>{passwordError}</div>
                    </div>
                  )}

                  <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-lg">
                    <Field label="Current Password" labelClassName="text-muted-foreground mb-1 uppercase tracking-wider">
                      <div className="relative">
                        <input
                          type={showCurrent ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          required
                          className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 pr-10"
                          placeholder="••••••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrent(!showCurrent)}
                          className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                        >
                          {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </Field>

                    <Field label="New Password" labelClassName="text-muted-foreground mb-1 uppercase tracking-wider">
                      <div className="relative">
                        <input
                          type={showNew ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                          className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 pr-10"
                          placeholder="••••••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNew(!showNew)}
                          className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                        >
                          {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </Field>

                    <Field label="Confirm New Password" labelClassName="text-muted-foreground mb-1 uppercase tracking-wider">
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="w-full bg-background border border-border rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="••••••••••••"
                      />
                    </Field>

                    {/* Password Checklist */}
                    <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-1.5 text-xs">
                      <div className="font-semibold text-foreground mb-1">Password Requirements:</div>
                      <div className={`flex items-center gap-2 ${hasMinLength ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                        <CheckCircle className="w-3.5 h-3.5" /> At least 10 characters
                      </div>
                      <div className={`flex items-center gap-2 ${hasUpper ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                        <CheckCircle className="w-3.5 h-3.5" /> At least one uppercase letter (A-Z)
                      </div>
                      <div className={`flex items-center gap-2 ${hasLower ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                        <CheckCircle className="w-3.5 h-3.5" /> At least one lowercase letter (a-z)
                      </div>
                      <div className={`flex items-center gap-2 ${hasNumber ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                        <CheckCircle className="w-3.5 h-3.5" /> At least one number (0-9)
                      </div>
                      <div className={`flex items-center gap-2 ${hasSpecial ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                        <CheckCircle className="w-3.5 h-3.5" /> At least one special character (!@#$%^&*)
                      </div>
                      <div className={`flex items-center gap-2 ${passwordsMatch ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                        <CheckCircle className="w-3.5 h-3.5" /> Passwords match
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={!isPasswordValid || passwordLoading}
                      className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                    >
                      {passwordLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                      <span>Update Password</span>
                    </button>
                  </form>
                </div>
              )}

              {/* 3. ACCOUNT & IDENTITY TAB */}
              {activeTab === 'account' && (
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Account & Organization Identity</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your authenticated principal profile and security tenant boundaries.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-muted/30 border border-border">
                      <div className="text-xs text-muted-foreground">User ID</div>
                      <div className="font-mono text-sm mt-1">{user?.id || 'usr_anonymous'}</div>
                    </div>

                    <div className="p-4 rounded-lg bg-muted/30 border border-border">
                      <div className="text-xs text-muted-foreground">Email Address</div>
                      <div className="font-medium text-sm mt-1">{user?.email || 'N/A'}</div>
                    </div>

                    <div className="p-4 rounded-lg bg-muted/30 border border-border">
                      <div className="text-xs text-muted-foreground">Tenant Scope</div>
                      <div className="font-medium text-sm mt-1 capitalize">{user?.scope || 'tenant'} ({user?.tenantId || 'global'})</div>
                    </div>
                  </div>

                  {/* Session Security */}
                  <div className="border-t border-border pt-6 space-y-4">
                    <h3 className="font-semibold text-base">Session Revocation & Sign Out</h3>
                    <p className="text-sm text-muted-foreground">
                      If you suspect unauthorized access or are using a shared workstation, you can immediately invalidate all refresh tokens associated with your account.
                    </p>

                    {revokeSuccess && (
                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm">
                        All other active sessions have been revoked.
                      </div>
                    )}

                    {revokeError && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm">
                        {revokeError}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => setRevokeConfirmOpen(true)}
                        disabled={revokeLoading}
                        className="px-4 py-2 border border-destructive text-destructive rounded-lg text-sm font-medium hover:bg-destructive/10 transition-colors flex items-center gap-2"
                      >
                        {revokeLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                        <span>Log Out All Other Sessions</span>
                      </button>

                      <button
                        onClick={() => logout()}
                        className="px-4 py-2 border border-border text-muted-foreground hover:text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. NOTIFICATIONS TAB */}
              {activeTab === 'notifications' && (
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Notification Preferences</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Control which events trigger automated notifications and email alerts through the platform queue.
                    </p>
                  </div>

                  {prefsNotice && (
                    <div
                      className={`p-4 rounded-lg text-sm flex items-start gap-3 ${prefsNotice.type === 'success'
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400'
                        }`}
                    >
                      {prefsNotice.type === 'success' ? (
                        <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      )}
                      <div>{prefsNotice.text}</div>
                    </div>
                  )}

                  {prefsLoading && (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading saved preferences...</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/20">
                      <div>
                        <div className="font-medium text-sm">Critical Vulnerability Alerts</div>
                        <div className="text-xs text-muted-foreground">Notify immediately when a CRITICAL (CVSS ≥ 9.0) finding is discovered</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.emailOnCritical}
                        onChange={(e) => updateNotifPref('emailOnCritical', e.target.checked)}
                        disabled={prefsLoading || prefsSaving}
                        className="w-4 h-4 accent-primary cursor-pointer disabled:opacity-50"
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/20">
                      <div>
                        <div className="font-medium text-sm">Scan Processing Completion</div>
                        <div className="text-xs text-muted-foreground">Receive automated summary when an SBOM / manifest scan completes</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.emailOnScanComplete}
                        onChange={(e) => updateNotifPref('emailOnScanComplete', e.target.checked)}
                        disabled={prefsLoading || prefsSaving}
                        className="w-4 h-4 accent-primary cursor-pointer disabled:opacity-50"
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/20">
                      <div>
                        <div className="font-medium text-sm">SLA Breach Warnings</div>
                        <div className="text-xs text-muted-foreground">Alert when high or critical findings approach remediation deadlines</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={notifPrefs.emailOnSlaBreach}
                        onChange={(e) => updateNotifPref('emailOnSlaBreach', e.target.checked)}
                        disabled={prefsLoading || prefsSaving}
                        className="w-4 h-4 accent-primary cursor-pointer disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleSavePreferences}
                      disabled={prefsSaving || prefsLoading}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {prefsSaving && <RefreshCw className="w-4 h-4 animate-spin" />}
                      <span>{prefsSaving ? 'Saving...' : 'Save Preferences'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <ConfirmDialog
          open={revokeConfirmOpen}
          onOpenChange={setRevokeConfirmOpen}
          title="Log out all other sessions?"
          description="Every other device signed in to your account will be logged out immediately. This session stays active."
          confirmLabel="Log Out Sessions"
          destructive
          loading={revokeLoading}
          onConfirm={handleRevokeAllSessions}
        />
      </AppShell>
    </AuthGate>
  );
}
