/**
 * State Management Architectural Conventions:
 * 1. Server Cache & Entity Synchronization → RTK Query (apiSlice.injectEndpoints)
 * 2. Cross-Component / Persisted Global UI → Redux Slices (auth, console, app-ui)
 * 3. Single-Page Transient / Form Drafts → Local component useState
 *
 * Constitution Invariant (Rule 1 & Rule 21):
 * Root reducer resets the entire state tree upon 'auth/logoutStore' or 'auth/tenantSwitched'
 * to prevent cross-tenant in-memory leaks.
 */

import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { apiSlice } from './api/api-slice';
import consoleReducer from './slices/console-slice';
import findingsReducer from './slices/findings-slice';
import scansReducer from './slices/scans-slice';
import assetsReducer from './slices/assets-slice';
import projectsReducer from './slices/projects-slice';
import authReducer from './slices/auth-slice';
import appUiReducer from './slices/app-ui-slice';

const appReducer = combineReducers({
  console: consoleReducer,
  appUi: appUiReducer,
  auth: authReducer,
  findings: findingsReducer,
  scans: scansReducer,
  assets: assetsReducer,
  projects: projectsReducer,
  [apiSlice.reducerPath]: apiSlice.reducer,
});

/**
 * Root reducer with tenant-safe memory purge (Rule 1 & Rule 21).
 * When logging out or switching tenant workspaces, resets entire state tree.
 */
const rootReducer = (state: ReturnType<typeof appReducer> | undefined, action: { type: string }) => {
  if (action.type === 'auth/logoutStore' || action.type === 'auth/tenantSwitched') {
    return appReducer(undefined, action);
  }
  return appReducer(state, action);
};

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore File object in pre-scan SBOM inspection state
        ignoredPaths: ['scans.reviewFile'],
        ignoredActions: ['scans/setReviewFile', 'scans/inspectSbom/fulfilled'],
      },
    }).concat(apiSlice.middleware),
});

// UI persistence subscriber: synchronizes sidebar collapse state to localStorage
if (typeof window !== 'undefined') {
  let prevCollapsed: boolean | undefined;
  store.subscribe(() => {
    try {
      const current = store.getState().appUi?.sidebarCollapsed;
      if (current !== undefined && current !== prevCollapsed) {
        prevCollapsed = current;
        localStorage.setItem('vm_ui_sidebar_collapsed', String(current));
      }
    } catch {
      // ignore storage access error
    }
  });
}

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
