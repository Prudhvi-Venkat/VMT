import { Suspense } from "react";
import { VmConsole } from "./vm-console";
import { AuthGate } from "@/components/auth/auth-gate";

export default function Home() {
  return (
    <AuthGate>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <VmConsole />
      </Suspense>
    </AuthGate>
  );
}

