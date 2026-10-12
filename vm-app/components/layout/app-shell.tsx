"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ShieldCheck,
  LayoutDashboard,
  AlertTriangle,
  Server,
  CloudUpload,
  Users,
  Settings,
  User as UserIcon,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  ChevronDown,
  Building2,
  KeyRound,
  FileText,
  SlidersHorizontal,
  UserPlus,
  FolderGit2,
  Layers,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Home,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/components/theme-provider";
import { useAppDispatch, useAppSelector } from "@/lib/store/hooks";
import {
  selectSidebarCollapsed,
  selectSidebarMobileOpen,
  selectExpandedMenus,
  setSidebarMobileOpen,
  toggleSidebarCollapsed,
  toggleSidebarMobileOpen,
  toggleSubmenu,
} from "@/lib/store/slices/app-ui-slice";
import { cn } from "@/lib/utils";
import type { NavCategory } from "@/lib/types";

interface AppShellProps {
  children: React.ReactNode;
  activeView?: string;
  onViewChange?: (view: string) => void;
  openFindingsCount?: number;
  breadcrumbPage?: string;
  breadcrumbItems?: Array<{ label: string; href?: string }>;
}

export function AppShell({
  children,
  activeView,
  onViewChange,
  openFindingsCount = 0,
  breadcrumbPage,
  breadcrumbItems,
}: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isPlatformAdmin, isTenantSuperAdmin, isTenantAdmin, isSecurityManager, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Sidebar responsive & collapse state (Redux appUi slice)
  const dispatch = useAppDispatch();
  const isMobileOpen = useAppSelector(selectSidebarMobileOpen);
  const isCollapsed = useAppSelector(selectSidebarCollapsed);
  const expandedMenus = useAppSelector(selectExpandedMenus);

  // Resolve current active item
  const currentView = activeView || (
    pathname === "/admin"
      ? "platform-admin"
      : pathname === "/tenant-admin"
      ? "tenant-admin"
      : pathname === "/security-oversight"
      ? "security-oversight"
      : pathname === "/settings"
      ? "settings"
      : pathname === "/profile"
      ? "profile"
      : "overview"
  );

  // Active sub-page label from ?tab= so the breadcrumb reflects the open form/page
  const tabParam = searchParams.get("tab");
  const activeCrumbLabel = tabParam ? activeTabLabels[pathname]?.[tabParam] : undefined;

  const handleNavClick = (key: string, href?: string) => {
    if (onViewChange) {
      onViewChange(key);
    }
    // Auto collapse mobile drawer after activity
    dispatch(setSidebarMobileOpen(false));

    const target = href ?? (
      key === "platform-admin" ? "/admin"
      : key === "tenant-admin" ? "/tenant-admin"
      : key === "security-oversight" ? "/security-oversight"
      : `/?view=${key}`
    );

    if (pathname !== target) {
      router.push(target);
    }
  };

  // Mobile drawer: lock background scroll, close on Escape, and release the
  // lock if the viewport grows to desktop while the drawer is still open.
  useEffect(() => {
    if (!isMobileOpen) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const apply = () => {
      document.body.style.overflow = desktop.matches ? "" : "hidden";
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch(setSidebarMobileOpen(false));
    };
    apply();
    desktop.addEventListener("change", apply);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      desktop.removeEventListener("change", apply);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isMobileOpen, dispatch]);

  // Categorized Navigation for Platform Admin
  const platformAdminNav: NavCategory[] = [
    {
      key: "overview",
      label: "Overview & Telemetry",
      icon: LayoutDashboard,
      iconClassName: "text-blue-500",
      href: "/admin?tab=overview",
      subItems: [
        { key: "platform-glance", label: "Platform Overview", href: "/admin?tab=overview" },
        { key: "system-telemetry", label: "Engine Telemetry", href: "/admin?tab=telemetry" },
      ],
    },
    {
      key: "tenants",
      label: "Tenants & Partitions",
      icon: Building2,
      iconClassName: "text-emerald-500",
      href: "/admin?tab=tenants",
      subItems: [
        { key: "all-tenants", label: "Tenant Directory", href: "/admin?tab=tenants" },
        { key: "provision-tenant", label: "Provision Tenant", href: "/admin?tab=provision" },
        { key: "db-partitions", label: "Database Partitions", href: "/admin?tab=tenants" },
      ],
    },
    {
      key: "sessions",
      label: "Session & Control",
      icon: KeyRound,
      iconClassName: "text-amber-500",
      href: "/admin?tab=sessions",
      subItems: [
        { key: "active-sessions", label: "Session Security", href: "/admin?tab=sessions" },
        { key: "token-controls", label: "Replay & Lockouts", href: "/admin?tab=sessions" },
      ],
    },
    {
      key: "audit",
      label: "Audit Trail",
      icon: FileText,
      iconClassName: "text-violet-500",
      href: "/admin?tab=audit",
      subItems: [
        { key: "live-audit", label: "Live Synced Audit Logs", href: "/admin?tab=audit" },
      ],
    },
    {
      key: "policies",
      label: "Policy Matrix",
      icon: SlidersHorizontal,
      iconClassName: "text-red-500",
      href: "/admin?tab=policies",
      subItems: [
        { key: "role-matrix", label: "RBAC Permissions", href: "/admin?tab=policies" },
        { key: "exposure-rules", label: "SLA Thresholds", href: "/admin?tab=policies" },
      ],
    },
    {
      key: "platform-admins",
      label: "Platform Admins",
      icon: UserPlus,
      iconClassName: "text-cyan-500",
      href: "/admin?tab=platform-admins",
      subItems: [
        { key: "admin-list", label: "Admin Directory", href: "/admin?tab=platform-admins" },
        { key: "register-admin", label: "Register Platform Admin", href: "/admin?tab=register-admin" },
      ],
    },
  ];

  // Categorized Navigation for Tenant Super Admin
  const tenantSuperAdminNav: NavCategory[] = [
    {
      key: "overview",
      label: "Dashboard",
      icon: LayoutDashboard,
      iconClassName: "text-blue-500",
      href: "/?view=overview",
      subItems: [
        { key: "overview-exposure", label: "Risk & Exposure Glance", href: "/?view=overview" },
        { key: "priority-findings", label: "Priority Findings", href: "/?view=findings" },
      ],
    },
    {
      key: "projects",
      label: "Projects & Scopes",
      icon: Layers,
      iconClassName: "text-emerald-500",
      href: "/tenant-admin?tab=projects",
      subItems: [
        { key: "all-projects", label: "All Projects", href: "/tenant-admin?tab=projects" },
        { key: "add-project", label: "Onboard Project", href: "/tenant-admin?tab=add-project" },
        { key: "project-assignments", label: "Project Assignments", href: "/tenant-admin?tab=projects" },
      ],
    },
    {
      key: "users",
      label: "Users & Memberships",
      icon: Users,
      iconClassName: "text-violet-500",
      href: "/tenant-admin?tab=members",
      subItems: [
        { key: "user-directory", label: "Team Directory", href: "/tenant-admin?tab=members" },
        { key: "add-user", label: "Add Member", href: "/tenant-admin?tab=add-user" },
      ],
    },
    {
      key: "integrations",
      label: "SCM & Cloud",
      icon: FolderGit2,
      iconClassName: "text-amber-500",
      href: "/tenant-admin?tab=integrations",
      subItems: [
        { key: "cloud-integrations", label: "Cloud (AWS, Azure, GCP)", href: "/tenant-admin?tab=integrations&filter=cloud" },
        { key: "scm-integrations", label: "SCM (GitHub, GitLab)", href: "/tenant-admin?tab=integrations&filter=scm" },
      ],
    },
    {
      key: "assets",
      label: "Assets & Infrastructure",
      icon: Server,
      iconClassName: "text-cyan-500",
      href: "/?view=assets",
      subItems: [
        { key: "asset-inventory", label: "Asset Inventory", href: "/?view=assets" },
        { key: "onboard-asset", label: "Onboard Asset", href: "/tenant-admin?tab=onboard-asset" },
      ],
    },
    {
      key: "scans",
      label: "SBOM Scans",
      icon: CloudUpload,
      iconClassName: "text-rose-500",
      href: "/?view=scans",
      subItems: [
        { key: "scan-history", label: "Scan History", href: "/?view=scans" },
        { key: "upload-sbom", label: "Scan SBOM / Manifest", href: "/?view=scans&action=upload" },
      ],
    },
    {
      key: "audit",
      label: "Audit Logs",
      icon: FileText,
      iconClassName: "text-purple-500",
      href: "/tenant-admin?tab=audit",
      subItems: [
        { key: "tenant-audit", label: "Tenant Audit Trail", href: "/tenant-admin?tab=audit" },
      ],
    },
  ];

  // Navigation for Security Manager (tenant-wide oversight)
  const securityManagerNav: NavCategory[] = [
    {
      key: "security-oversight",
      label: "Security Oversight",
      icon: ShieldCheck,
      iconClassName: "text-red-500",
      href: "/security-oversight",
      subItems: [
        { key: "active-findings", label: "Active Vulnerabilities", href: "/security-oversight" },
        { key: "active-scans", label: "Active Scans", href: "/security-oversight" },
      ],
    },
    { key: "findings", label: "Findings", icon: AlertTriangle, iconClassName: "text-red-500", href: "/?view=findings", badge: openFindingsCount },
    { key: "assets", label: "Assets", icon: Server, iconClassName: "text-cyan-500", href: "/?view=assets" },
    { key: "scans", label: "SBOM Scans", icon: CloudUpload, iconClassName: "text-rose-500", href: "/?view=scans" },
  ];

  // Standard Navigation for Analysts / Members
  const standardNav: NavCategory[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard, iconClassName: "text-blue-500", href: "/?view=overview" },
    { key: "findings", label: "Findings", icon: AlertTriangle, iconClassName: "text-red-500", href: "/?view=findings", badge: openFindingsCount },
    { key: "assets", label: "Assets", icon: Server, iconClassName: "text-cyan-500", href: "/?view=assets" },
    { key: "scans", label: "SBOM Scans", icon: CloudUpload, iconClassName: "text-rose-500", href: "/?view=scans" },
  ];

  const currentNavCategories = isPlatformAdmin
    ? platformAdminNav
    : (isTenantSuperAdmin || isTenantAdmin)
    ? tenantSuperAdminNav
    : isSecurityManager
    ? securityManagerNav
    : standardNav;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* ── Mobile Sidebar Overlay ────────────────────────────────────────── */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-xs md:hidden"
          onClick={() => dispatch(setSidebarMobileOpen(false))}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 border-r border-border bg-card flex flex-col transition-all duration-300",
          isCollapsed ? "w-16" : "w-64",
          isMobileOpen
            ? "translate-x-0"
            : "-translate-x-full invisible md:translate-x-0 md:visible"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <Link
            href="/?view=overview"
            onClick={() => dispatch(setSidebarMobileOpen(false))}
            className="flex items-center gap-3 overflow-hidden"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <ShieldCheck size={20} />
            </div>
            {!isCollapsed && (
              <div className="truncate">
                <div className="text-sm font-bold tracking-tight text-foreground truncate">
                  Vulnerability
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Management
                </div>
              </div>
            )}
          </Link>

          {/* Desktop collapse toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => dispatch(toggleSidebarCollapsed())}
            className="hidden md:flex h-7 w-7 text-muted-foreground hover:text-foreground"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </Button>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
          {currentNavCategories.map((item) => {
            const hasSub = Array.isArray(item.subItems) && item.subItems.length > 0;
            const isExpanded = expandedMenus[item.key] ?? false;
            const Icon = item.icon;
            const isCurrentTab = currentView === item.key;

            return (
              <div key={item.key} className="space-y-1">
                <div className="flex items-center">
                  <Button
                    variant={isCurrentTab ? "secondary" : "ghost"}
                    onClick={() => {
                      if (hasSub && !isCollapsed) {
                        dispatch(toggleSubmenu(item.key));
                      }
                      if (item.href) {
                        handleNavClick(item.key, item.href);
                      }
                    }}
                    className={cn(
                      "w-full justify-start gap-2.5 px-3 py-2 text-xs font-semibold text-foreground/90 hover:text-foreground",
                      isCollapsed && "justify-center px-0"
                    )}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon
                      size={16}
                      className={
                        isCurrentTab
                          ? "text-primary"
                          : item.iconClassName ?? "text-muted-foreground"
                      }
                    />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                    {!isCollapsed && item.badge !== undefined && item.badge > 0 && (
                      <Badge
                        variant="outline"
                        className="ml-auto border-red-500/40 bg-red-500/10 text-red-500 text-[10px] px-1.5 py-0"
                      >
                        {item.badge}
                      </Badge>
                    )}
                    {!isCollapsed && hasSub && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch(toggleSubmenu(item.key));
                        }}
                        className="ml-auto p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    )}
                  </Button>
                </div>

                {/* Submenus if expanded and not collapsed */}
                {!isCollapsed && hasSub && isExpanded && (
                  <div className="ml-6 pl-2 border-l border-border/80 space-y-1">
                    {item.subItems!.map((sub) => (
                      <Button
                        key={sub.key}
                        variant="ghost"
                        size="sm"
                        onClick={() => handleNavClick(sub.key, sub.href)}
                        className="w-full justify-start h-7 px-2.5 text-[11px] font-normal text-muted-foreground hover:text-foreground"
                      >
                        <span className="truncate">{sub.label}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── User Session Footer (Role moved to bottom per specification) ── */}
        <div className="p-3 border-t border-border bg-muted/20">
          <div className={cn("rounded-xl border border-border bg-card p-3 shadow-xs space-y-2", isCollapsed && "p-1.5")}>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              {!isCollapsed && (
                <span className="text-[11px] font-semibold text-foreground">
                  {isAuthenticated ? "Authenticated" : "Connecting..."}
                </span>
              )}
            </div>

            {!isCollapsed && (
              <div className="pt-1 border-t border-border/50 text-[11px] text-muted-foreground truncate font-mono">
                {user?.email || "anonymous"}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main Area with Fixed Header ───────────────────────────────────── */}
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-300",
          isCollapsed ? "md:pl-16" : "md:pl-64"
        )}
      >
        {/* Fixed Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 sm:px-6 backdrop-blur">
          {/* Header Left: Mobile Toggle & Tenant Name */}
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => dispatch(toggleSidebarMobileOpen())}
              className="md:hidden h-8 w-8"
              aria-label="Toggle navigation"
            >
              <Menu size={18} />
            </Button>

            {/* Tenant Name Badge: Only tenant name without 'Tenant:' label */}
            {user?.tenantId && (
              <Badge variant="outline" className="font-mono text-[11px] px-2.5 py-0.5 bg-muted/40 font-semibold border-border truncate max-w-[45vw]">
                {user.tenantId}
              </Badge>
            )}
          </div>

          {/* Header Right: User Avatar Dropdown Only (No username/email text) */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-9 w-9 rounded-full hover:bg-muted focus-visible:ring-1"
                  aria-label="User Account Menu"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-xs">
                    {(user?.email?.[0] || "U").toUpperCase()}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card border-border">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-xs font-semibold text-foreground truncate">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {/* Dark Mode Toggle */}
                <DropdownMenuItem
                  onClick={toggleTheme}
                  className="cursor-pointer gap-2 text-xs"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                </DropdownMenuItem>

                {/* Profile */}
                <DropdownMenuItem
                  onClick={() => router.push("/profile")}
                  className="cursor-pointer gap-2 text-xs"
                >
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <span>Profile</span>
                </DropdownMenuItem>

                {/* Settings */}
                <DropdownMenuItem
                  onClick={() => router.push("/settings")}
                  className="cursor-pointer gap-2 text-xs"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <span>Settings</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Sign Out */}
                <DropdownMenuItem
                  onClick={async () => {
                    await logout();
                    router.push("/login");
                  }}
                  className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          {/* Breadcrumb bar (top of content area, below fixed header) */}
          <nav className="flex items-center gap-1.5 px-4 sm:px-6 lg:px-8 py-3 text-xs text-muted-foreground border-b border-border bg-background/95 backdrop-blur overflow-hidden">
            <Link
              href="/?view=overview"
              className="flex items-center gap-1 font-semibold text-foreground/90 hover:text-primary transition-colors hover:underline shrink-0"
            >
              <Home size={13} className="shrink-0" />
              <span className="hidden sm:inline">Vulnerability Management</span>
            </Link>
            {breadcrumbItems && breadcrumbItems.length > 0 ? (
              breadcrumbItems.map((item, idx) => (
                <React.Fragment key={idx}>
                  <ChevronRight size={13} className="text-muted-foreground/60 shrink-0" />
                  {item.href && idx < breadcrumbItems.length - 1 ? (
                    <Link
                      href={item.href}
                      className="hover:text-primary hover:underline transition-colors font-medium truncate max-w-[150px]"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="font-semibold text-foreground truncate max-w-[180px]">
                      {item.label}
                    </span>
                  )}
                </React.Fragment>
              ))
            ) : (
              <>
                <ChevronRight size={13} className="text-muted-foreground/60 shrink-0" />
                <span className="font-medium text-foreground truncate max-w-[200px]">
                  {breadcrumbPage || resolvedBreadcrumbLabel(currentView)}
                </span>
                {activeCrumbLabel && (
                  <>
                    <ChevronRight size={13} className="text-muted-foreground/60 shrink-0" />
                    <span className="font-semibold text-foreground truncate max-w-[200px]">
                      {activeCrumbLabel}
                    </span>
                  </>
                )}
              </>
            )}
          </nav>

          <div className="p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Maps ?tab= values (used by the sidebar links) to human-readable
 * breadcrumb labels per route, so the content-area breadcrumb always
 * reflects the page/form the user is on.
 */
const activeTabLabels: Record<string, Record<string, string>> = {
  "/tenant-admin": {
    overview: "Projects Overview",
    projects: "Projects Overview",
    assets: "Asset Management",
    users: "Users & Memberships",
    members: "Users & Memberships",
    integrations: "SCM & Cloud Integrations",
    audit: "Tenant Audit Logs",
    "onboard-asset": "Onboard Asset",
    "add-project": "Create Project",
    "add-user": "Invite User",
  },
  "/admin": {
    overview: "Session & Control",
    sessions: "Session & Control",
    tenants: "Tenants & Partitions",
    provision: "Provision Tenant",
    telemetry: "Backend Telemetry",
    audit: "Security Audit Trail",
    policies: "RBAC & Policy Matrix",
    "platform-admins": "Platform Admins",
    "register-admin": "Register Platform Admin",
  },
};

function resolvedBreadcrumbLabel(view: string): string {
  switch (view) {
    case "overview":
      return "Overview";
    case "findings":
      return "Findings";
    case "assets":
      return "Assets";
    case "scans":
      return "SBOM Scans";
    case "tenant-admin":
      return "Tenant Administration";
    case "security-oversight":
      return "Security Oversight";
    case "platform-admin":
      return "Platform Administration";
    case "settings":
      return "Settings";
    case "profile":
      return "User Profile";
    default:
      return "Console";
  }
}
