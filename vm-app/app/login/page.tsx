import { Metadata } from "next";
import { Suspense } from "react";
import { LoginView } from "@/components/auth/login-view";

export const metadata: Metadata = {
  title: "Sign In · Security Exposure Platform",
  description:
    "Sign in to the Vulnerability Management & Platform Administration Console",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginView />
    </Suspense>
  );
}
