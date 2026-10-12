import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { ConsoleProject } from '@/lib/types';
import { projectsApi } from '../api/projects-api';
import { usersApi } from '../api/users-api';
import type { RootState, AppDispatch } from '../index';

export interface ProjectsState {
  items: ConsoleProject[];
  selectedProjectId: string;
  scanTargetProjectId: string;
  scanStage: string;
  members: Array<{ id: string; name?: string; email: string; role?: string }>;
  loading: boolean;
  error: string | null;
}

const initialState: ProjectsState = {
  items: [],
  selectedProjectId: 'all',
  scanTargetProjectId: '',
  scanStage: 'DEV',
  members: [],
  loading: false,
  error: null,
};

// ─── Async Thunks ────────────────────────────────────────────────────────────

export const fetchProjectsThunk = createAsyncThunk<
  ConsoleProject[],
  string | void,
  { dispatch: AppDispatch; rejectValue: string }
>('projects/fetchProjects', async (_, { dispatch, rejectWithValue }) => {
  try {
    const res = await dispatch(projectsApi.endpoints.getProjects.initiate()).unwrap();
    if (res && res.success && Array.isArray(res.data)) {
      return res.data as ConsoleProject[];
    }
    return [];
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : 'Failed to fetch projects');
  }
});

export const fetchMembersThunk = createAsyncThunk<
  Array<{ id: string; name?: string; email: string; role?: string }>,
  string | void,
  { dispatch: AppDispatch; rejectValue: string }
>('projects/fetchMembers', async (_, { dispatch, rejectWithValue }) => {
  try {
    const res = await dispatch(usersApi.endpoints.getUsers.initiate()).unwrap();
    if (res && res.success && Array.isArray(res.data)) {
      return res.data as Array<{ id: string; name?: string; email: string; role?: string }>;
    }
    return [];
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : 'Failed to fetch members');
  }
});

// ─── Slice Definition ────────────────────────────────────────────────────────

export const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    setSelectedProjectId: (state, action: PayloadAction<string>) => {
      state.selectedProjectId = action.payload;
    },
    setScanTargetProjectId: (state, action: PayloadAction<string>) => {
      state.scanTargetProjectId = action.payload;
    },
    setScanStage: (state, action: PayloadAction<string>) => {
      state.scanStage = action.payload;
    },
    resetProjects: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // Fetch Projects
      .addCase(fetchProjectsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProjectsThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
        if (action.payload.length > 0 && !state.scanTargetProjectId) {
          state.scanTargetProjectId = action.payload[0].id;
        }
      })
      .addCase(fetchProjectsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Fetch Members
      .addCase(fetchMembersThunk.fulfilled, (state, action) => {
        state.members = action.payload;
      });
  },
});

export const {
  setSelectedProjectId,
  setScanTargetProjectId,
  setScanStage,
  resetProjects,
} = projectsSlice.actions;

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectAllProjects = (state: RootState) => state.projects.items;
export const selectSelectedProjectId = (state: RootState) => state.projects.selectedProjectId;
export const selectScanTargetProjectId = (state: RootState) => state.projects.scanTargetProjectId;
export const selectScanStage = (state: RootState) => state.projects.scanStage;
export const selectProjectMembers = (state: RootState) => state.projects.members;

export default projectsSlice.reducer;
