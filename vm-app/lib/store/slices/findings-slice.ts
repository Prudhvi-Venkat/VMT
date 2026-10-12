import { createSlice, createAsyncThunk, createSelector, PayloadAction } from '@reduxjs/toolkit';
import type { Finding, FindingStatus } from '@/lib/types';
import { findingsApi, type FindingQueryParams } from '../api/findings-api';
import type { RootState, AppDispatch } from '../index';

export interface FindingsState {
  items: Finding[];
  selectedFinding: Finding | null;
  cveDetailFinding: Finding | null;
  searchQuery: string;
  scopeFilter: string;
  loading: boolean;
  error: string | null;
  statusUpdateSuccess: string | null;
  statusUpdateError: string | null;
}

const initialState: FindingsState = {
  items: [],
  selectedFinding: null,
  cveDetailFinding: null,
  searchQuery: '',
  scopeFilter: 'all',
  loading: false,
  error: null,
  statusUpdateSuccess: null,
  statusUpdateError: null,
};

// ─── Async Thunks ────────────────────────────────────────────────────────────

export const fetchTenantFindings = createAsyncThunk<
  Finding[],
  { token?: string; query?: FindingQueryParams },
  { dispatch: AppDispatch; rejectValue: string }
>('findings/fetchTenantFindings', async ({ query }, { dispatch, rejectWithValue }) => {
  try {
    const res = await dispatch(findingsApi.endpoints.getFindings.initiate(query, { forceRefetch: true })).unwrap();
    return res || [];
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : 'Failed to fetch findings');
  }
});

export const updateFindingStatusThunk = createAsyncThunk<
  { findingId: string; newStatus: FindingStatus; reason?: string },
  {
    findingId: string;
    newStatus: FindingStatus;
    reason?: string;
    token?: string;
  },
  { dispatch: AppDispatch; rejectValue: string }
>('findings/updateStatus', async ({ findingId, newStatus, reason }, { dispatch, rejectWithValue }) => {
  try {
    await dispatch(
      findingsApi.endpoints.updateFindingStatus.initiate({
        findingId,
        status: newStatus,
        reason,
      })
    ).unwrap();
    return { findingId, newStatus, reason };
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : 'Failed to persist status change');
  }
});

export const assignFindingThunk = createAsyncThunk<
  { findingId: string; assignedTo: string; assignedUserName: string; assignedAt: string },
  {
    findingId: string;
    assignedTo: string;
    assignedUserName: string;
    token?: string;
  },
  { dispatch: AppDispatch; rejectValue: string }
>('findings/assign', async ({ findingId, assignedTo, assignedUserName }, { dispatch, rejectWithValue }) => {
  try {
    await dispatch(
      findingsApi.endpoints.assignFinding.initiate({
        findingId,
        assignedTo,
        assignedUserName,
      })
    ).unwrap();
    return {
      findingId,
      assignedTo,
      assignedUserName,
      assignedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : 'Failed to assign finding');
  }
});

// ─── Slice Definition ────────────────────────────────────────────────────────

export const findingsSlice = createSlice({
  name: 'findings',
  initialState,
  reducers: {
    setInitialFindings: (state, action: PayloadAction<Finding[]>) => {
      state.items = action.payload;
    },
    setSelectedFinding: (state, action: PayloadAction<Finding | null>) => {
      state.selectedFinding = action.payload;
    },
    setCveDetailFinding: (state, action: PayloadAction<Finding | null>) => {
      state.cveDetailFinding = action.payload;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    setScopeFilter: (state, action: PayloadAction<string>) => {
      state.scopeFilter = action.payload;
    },
    clearStatusMessages: (state) => {
      state.statusUpdateSuccess = null;
      state.statusUpdateError = null;
    },
    resetFindings: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // Fetch Findings
      .addCase(fetchTenantFindings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTenantFindings.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchTenantFindings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Update Finding Status (Optimistic update on pending)
      .addCase(updateFindingStatusThunk.pending, (state, action) => {
        const { findingId, newStatus } = action.meta.arg;
        state.items = state.items.map((f) =>
          f.id === findingId ? { ...f, status: newStatus } : f
        );
        if (state.selectedFinding && state.selectedFinding.id === findingId) {
          state.selectedFinding.status = newStatus;
        }
        state.statusUpdateSuccess = null;
        state.statusUpdateError = null;
      })
      .addCase(updateFindingStatusThunk.fulfilled, (state, action) => {
        state.statusUpdateSuccess = `Finding status updated to ${action.payload.newStatus.replace('_', ' ')}`;
      })
      .addCase(updateFindingStatusThunk.rejected, (state, action) => {
        state.statusUpdateError = action.payload as string;
      })

      // Assign Finding
      .addCase(assignFindingThunk.fulfilled, (state, action) => {
        const { findingId, assignedTo, assignedUserName, assignedAt } = action.payload;
        state.items = state.items.map((f) =>
          f.id === findingId ? { ...f, assignedTo, assignedUserName, assignedAt } : f
        );
        if (state.selectedFinding && state.selectedFinding.id === findingId) {
          state.selectedFinding.assignedTo = assignedTo;
          state.selectedFinding.assignedUserName = assignedUserName;
          state.selectedFinding.assignedAt = assignedAt;
        }
      })
      .addMatcher(
        findingsApi.endpoints.getFindings.matchFulfilled,
        (state, action) => {
          state.loading = false;
          state.items = action.payload;
        }
      );
  },
});

export const {
  setInitialFindings,
  setSelectedFinding,
  setCveDetailFinding,
  setSearchQuery,
  setScopeFilter,
  clearStatusMessages,
  resetFindings,
} = findingsSlice.actions;

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectAllFindings = (state: RootState) => state.findings.items;
export const selectSelectedFinding = (state: RootState) => state.findings.selectedFinding;
export const selectCveDetailFinding = (state: RootState) => state.findings.cveDetailFinding;
export const selectSearchQuery = (state: RootState) => state.findings.searchQuery;
export const selectScopeFilter = (state: RootState) => state.findings.scopeFilter;
export const selectFindingsLoading = (state: RootState) => state.findings.loading;
export const selectFindingsError = (state: RootState) => state.findings.error;
export const selectStatusUpdateSuccess = (state: RootState) => state.findings.statusUpdateSuccess;
export const selectStatusUpdateError = (state: RootState) => state.findings.statusUpdateError;

export const selectScopedFindings = createSelector(
  [
    selectAllFindings,
    (state: RootState) => state.projects?.selectedProjectId || 'all',
    selectSearchQuery,
    selectScopeFilter,
  ],
  (findings, selectedProjectId, query, scope) => {
    return findings.filter((item) => {
      const scopedItem = item as Finding & { project_id?: string; projectId?: string };
      const itemProjectId = scopedItem.project_id || scopedItem.projectId;
      const matchesProject =
        selectedProjectId === 'all' ||
        itemProjectId === selectedProjectId ||
        (!itemProjectId && selectedProjectId.endsWith('_default'));

      const matchesQuery =
        !query ||
        `${item.title} ${item.component_name ?? ''} ${item.cve_id ?? ''}`
          .toLowerCase()
          .includes(query.toLowerCase());

      const matchesScope = scope === 'all' || item.dependency_scope === scope;

      return matchesProject && matchesQuery && matchesScope;
    });
  }
);

export const selectOpenFindings = createSelector(
  [selectScopedFindings],
  (scoped) => scoped.filter((f) => !['closed', 'false_positive', 'remediated'].includes(f.status))
);

export const selectRiskMetrics = createSelector(
  [selectAllFindings, selectOpenFindings],
  (all, open) => {
    const criticalCount = all.filter((f) => f.risk_band === 'critical').length;
    const highCount = all.filter((f) => f.risk_band === 'high').length;
    const averageRisk = open.length
      ? Math.round(open.reduce((sum, item) => sum + item.risk_score, 0) / open.length)
      : 0;
    const breachedSla = open.filter((item) => new Date(item.sla_due_at) < new Date()).length;

    return {
      averageRisk,
      criticalCount,
      highCount,
      openCount: open.length,
      breachedSla,
    };
  }
);

export default findingsSlice.reducer;
