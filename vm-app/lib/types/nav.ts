import type { ElementType } from "react";

/** Sidebar navigation configuration consumed by the app shell. */

export interface NavSubItem {
  key: string;
  label: string;
  href: string;
}

export interface NavCategory {
  key: string;
  label: string;
  icon: ElementType;
  /** Tint applied to the nav icon (falls back to primary/muted by active state). */
  iconClassName?: string;
  href?: string;
  badge?: number;
  subItems?: NavSubItem[];
}
