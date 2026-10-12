"use client";

import React, {createContext, useContext, useState, useCallback} from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export interface ToastOptions {
  title?: string;
  description?: string;
  message?: string;
  type?: ToastType | string;
}

interface ToastContextType {
  toast: {
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    info: (title: string, message?: string) => void;
    warning: (title: string, message?: string) => void;
  };
  showToast: (param: string | ToastOptions, type?: ToastType, title?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, title: string, message?: string, duration = 4000) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newToast: Toast = { id, type, title, message, duration };
      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }
    },
    [dismiss]
  );

  const toast = {
    success: useCallback((title: string, message?: string) => addToast("success", title, message), [addToast]),
    error: useCallback((title: string, message?: string) => addToast("error", title, message, 6000), [addToast]),
    info: useCallback((title: string, message?: string) => addToast("info", title, message), [addToast]),
    warning: useCallback((title: string, message?: string) => addToast("warning", title, message, 5000), [addToast]),
  };

  const showToast = useCallback(
    (param: string | ToastOptions, type: ToastType = "info", title?: string) => {
      if (typeof param === "object" && param !== null) {
        const rawType = (param.type as ToastType) || "info";
        const t: ToastType = ["success", "error", "warning", "info"].includes(rawType) ? rawType : "info";
        const heading =
          param.title ||
          (t === "success"
            ? "Success"
            : t === "error"
            ? "Error"
            : t === "warning"
            ? "Notice"
            : "Information");
        const body = param.description || param.message || "";
        addToast(t, heading, body);
      } else {
        const defaultTitle =
          type === "success"
            ? "Success"
            : type === "error"
            ? "Error"
            : type === "warning"
            ? "Notice"
            : "Information";
        addToast(type, title || defaultTitle, param);
      }
    },
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ toast, showToast, dismiss }}>
      {children}
      {/* Toast Notification Container */}
      <div
        aria-live="assertive"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-md w-full pointer-events-none p-2 sm:p-0"
      >
        {toasts.map((t) => {
          const typeConfig = {
            success: {
              icon: CheckCircle2,
              border: "border-emerald-500/40 bg-card text-card-foreground shadow-lg shadow-emerald-950/10",
              iconColor: "text-emerald-500",
            },
            error: {
              icon: AlertCircle,
              border: "border-destructive/50 bg-card text-card-foreground shadow-lg shadow-destructive/10",
              iconColor: "text-destructive",
            },
            warning: {
              icon: AlertTriangle,
              border: "border-amber-500/40 bg-card text-card-foreground shadow-lg shadow-amber-950/10",
              iconColor: "text-amber-500",
            },
            info: {
              icon: Info,
              border: "border-primary/40 bg-card text-card-foreground shadow-lg shadow-primary/10",
              iconColor: "text-primary",
            },
          }[t.type];

          const Icon = typeConfig.icon;

          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl border p-4 transition-all duration-300 animate-in slide-in-from-bottom-5 backdrop-blur-md",
                typeConfig.border
              )}
              role="alert"
            >
              <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", typeConfig.iconColor)} />
              <div className="flex-1 space-y-1 pr-2">
                <p className="text-xs font-semibold leading-none tracking-tight text-foreground">{t.title}</p>
                {t.message && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{t.message}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground/80 hover:text-foreground transition-colors hover:bg-muted"
                aria-label="Dismiss toast"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
