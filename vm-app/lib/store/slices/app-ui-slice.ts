import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';

const SIDEBAR_COLLAPSED_KEY = 'vm_ui_sidebar_collapsed';

const getInitialCollapsed = (): boolean => {
  if (typeof window !== 'undefined') {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  }
  return false;
};

export interface AppUiState {
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  expandedMenus: Record<string, boolean>;
}

const initialState: AppUiState = {
  sidebarCollapsed: getInitialCollapsed(),
  sidebarMobileOpen: false,
  expandedMenus: {
    overview: true,
    tenants: true,
    projects: true,
    users: false,
    integrations: false,
    assets: true,
    scans: false,
  },
};

export const appUiSlice = createSlice({
  name: 'appUi',
  initialState,
  reducers: {
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(action.payload));
        } catch {
          // ignore storage error
        }
      }
    },
    toggleSidebarCollapsed: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(state.sidebarCollapsed));
        } catch {
          // ignore storage error
        }
      }
    },
    setSidebarMobileOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarMobileOpen = action.payload;
    },
    toggleSidebarMobileOpen: (state) => {
      state.sidebarMobileOpen = !state.sidebarMobileOpen;
    },
    toggleSubmenu: (state, action: PayloadAction<string>) => {
      const key = action.payload;
      state.expandedMenus[key] = !state.expandedMenus[key];
    },
    setExpandedMenus: (state, action: PayloadAction<Record<string, boolean>>) => {
      state.expandedMenus = action.payload;
    },
  },
});

export const {
  setSidebarCollapsed,
  toggleSidebarCollapsed,
  setSidebarMobileOpen,
  toggleSidebarMobileOpen,
  toggleSubmenu,
  setExpandedMenus,
} = appUiSlice.actions;

export const selectSidebarCollapsed = (state: RootState) => state.appUi.sidebarCollapsed;
export const selectSidebarMobileOpen = (state: RootState) => state.appUi.sidebarMobileOpen;
export const selectExpandedMenus = (state: RootState) => state.appUi.expandedMenus;

export default appUiSlice.reducer;
