import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AuthProvider } from "@/lib/auth-context";
import { ReduxProvider } from "@/lib/store/provider";
import { ThemeProvider } from "@/components/theme-provider";

import { ToastProvider } from "@/components/ui/toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vulnerability Management",
  description: "Enterprise Vulnerability Management & Security Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased", inter.variable, "font-sans")}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground transition-colors duration-200 font-sans">
        <ReduxProvider>
          <ThemeProvider defaultTheme="dark">
            <ToastProvider>
              <AuthProvider>{children}</AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}

