"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  Activity,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RegisterSuperAdminModal } from "./register-super-admin-modal";
import { useAuth } from "@/lib/auth-context";
import { Field } from "@/components/shared/form-field";
import { useForgotPasswordMutation } from "@/lib/store/api";

export function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isExpired = searchParams.get("expired") === "1";

  const { login, user, isAuthenticated, isPlatformAdmin, isTenantSuperAdmin, isTenantAdmin, isSecurityManager, isLoading: authLoading, error, clearError } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  // Forgot password flow state (R4)
  const [forgotPasswordMutation, { isLoading: isForgotSubmitting }] = useForgotPasswordMutation();
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotError(null);
    try {
      await forgotPasswordMutation({ email: forgotEmail.trim() }).unwrap();
      setForgotSuccess(true);
    } catch (err: unknown) {
      setForgotError(err instanceof Error ? err.message : "Failed to initiate password reset.");
    }
  };

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      if (user?.mustChangePassword) {
        router.push("/settings?forcePasswordChange=1");
        return;
      }
      if (isPlatformAdmin) {
        router.push("/admin");
      } else if (isTenantSuperAdmin || isTenantAdmin) {
        router.push("/tenant-admin");
      } else if (isSecurityManager) {
        router.push("/security-oversight");
      } else {
        router.push("/");
      }
    }
  }, [isAuthenticated, isPlatformAdmin, isTenantSuperAdmin, isTenantAdmin, isSecurityManager, user?.mustChangePassword, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsSubmitting(true);
    clearError();

    await login(email, password);
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Vulnerability Management
          </h1>
          <p className="text-xs text-muted-foreground">
            Sign in to access your security console
          </p>
        </div>

        {/* Login Card */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="sr-only">
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your credentials to continue</CardDescription>
          </CardHeader>

          <CardContent className="pt-6 space-y-4">
            {isExpired && (
              <Alert className="border-amber-200 bg-amber-50 text-amber-800 text-xs py-2.5">
                <Clock className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs font-medium">
                  Your session has expired. Please sign in again.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive" className="text-xs py-2.5">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle className="text-xs font-semibold">Authentication Failed</AlertTitle>
                <AlertDescription className="text-xs mt-0.5">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email Address" htmlFor="email" className="space-y-1">
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) clearError();
                    }}
                    required
                    className="pl-9 h-9 text-xs"
                    autoComplete="email"
                    disabled={isSubmitting || authLoading}
                  />
                </div>
              </Field>

              <div className="space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <Label
                    htmlFor="password"
                    className="text-xs font-semibold text-foreground"
                  >
                    Password
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-[11px] font-medium text-primary hover:underline hover:text-primary/90 focus:outline-none"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) clearError();
                    }}
                    required
                    className="pl-9 pr-9 h-9 text-xs"
                    autoComplete="current-password"
                    disabled={isSubmitting || authLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-9 text-xs font-semibold gap-1.5 shadow-xs mt-2"
                disabled={isSubmitting || authLoading}
              >
                {isSubmitting || authLoading ? (
                  <>
                    <Activity className="h-3.5 w-3.5 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </form>

            {/* Tenant Super Admin Registration Link */}
            <div className="pt-2 text-center text-xs text-muted-foreground border-t border-border mt-4">
              <span>Onboarding a new organization? </span>
              <button
                type="button"
                onClick={() => setShowRegister(true)}
                className="font-semibold text-primary hover:underline hover:text-primary/90 inline-block focus:outline-none"
              >
                Register as Super Admin
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Forgot Password Dialog (R4) */}
        <Dialog
          open={showForgotPassword}
          onOpenChange={(open) => {
            setShowForgotPassword(open);
            if (!open) {
              setForgotSuccess(false);
              setForgotError(null);
            } else {
              setForgotEmail(email);
            }
          }}
        >
          <DialogContent className="max-w-md p-6 bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-foreground">Reset Password</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Enter your account email to dispatch a secure password reset link.
              </DialogDescription>
            </DialogHeader>

            {forgotSuccess ? (
              <div className="space-y-4 py-2">
                <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                  <AlertTitle className="text-xs font-semibold">Instructions Dispatched</AlertTitle>
                  <AlertDescription className="text-xs">
                    If an account is registered with <strong>{forgotEmail}</strong>, instructions and a secure recovery token have been dispatched.
                  </AlertDescription>
                </Alert>
                <div className="flex justify-end pt-2">
                  <Button size="sm" onClick={() => setShowForgotPassword(false)} className="text-xs">
                    Back to Sign In
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleForgotPasswordSubmit} className="space-y-4 py-2">
                {forgotError && (
                  <Alert variant="destructive" className="py-2 text-xs">
                    <AlertDescription>{forgotError}</AlertDescription>
                  </Alert>
                )}
                <Field label="Work Email Address" required>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="name@organization.com"
                      className="pl-9 h-9 text-xs"
                      required
                    />
                  </div>
                </Field>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
                  <span className="font-semibold text-foreground">Need urgent platform recovery?</span>
                  <p className="text-[11px] text-muted-foreground">
                    Super Admins can also reset passwords directly via the Platform Admin & Tenant Admin consoles with audit verification.
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowForgotPassword(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isForgotSubmitting || !forgotEmail}
                    className="text-xs"
                  >
                    {isForgotSubmitting ? "Dispatching..." : "Send Reset Link"}
                  </Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Super Admin Registration Modal */}
        <RegisterSuperAdminModal
          open={showRegister}
          onOpenChange={setShowRegister}
          onSuccess={() => {
            setShowRegister(false);
          }}
        />
      </div>
    </div>
  );
}
