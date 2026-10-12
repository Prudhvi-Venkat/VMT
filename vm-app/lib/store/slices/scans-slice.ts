import { createSlice, createAsyncThunk, createSelector, PayloadAction } from '@reduxjs/toolkit';
import type { SbomScan, ActiveScanProgress, InspectComponent, UploadScanParams } from '@/lib/types';
import { scansApi } from '../api/scans-api';
import type { RootState, AppDispatch } from '../index';

export interface ScansState {
  items: SbomScan[];
  activeScanProgress: ActiveScanProgress | null;
  uploading: boolean;
  uploadMessage: string;
  inspecting: boolean;
  reviewModalOpen: boolean;
  reviewFile: File | null;
  reviewFileType: string;
  reviewComponents: InspectComponent[];
  reviewWarnings: string[];
  loading: boolean;
  error: string | null;
}

const initialState: ScansState = {
  items: [],
  activeScanProgress: null,
  uploading: false,
  uploadMessage: '',
  inspecting: false,
  reviewModalOpen: false,
  reviewFile: null,
  reviewFileType: 'json',
  reviewComponents: [],
  reviewWarnings: [],
  loading: false,
  error: null,
};

// ─── Async Thunks ────────────────────────────────────────────────────────────

export const fetchScansThunk = createAsyncThunk<
  SbomScan[],
  string | void,
  { dispatch: AppDispatch; rejectValue: string }
>('scans/fetchScans', async (_, { dispatch, rejectWithValue }) => {
  try {
    const res = await dispatch(scansApi.endpoints.getScans.initiate({}, { forceRefetch: true })).unwrap();
    return res || [];
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : 'Failed to fetch scans');
  }
});

export const inspectSbomThunk = createAsyncThunk<
  { file: File; fileType: string; components: InspectComponent[]; warnings: string[] } | null,
  { file: File; token?: string },
  { dispatch: AppDispatch; rejectValue: string }
>('scans/inspectSbom', async ({ file }, { dispatch, rejectWithValue }) => {
  try {
    const inspectRes = await dispatch(scansApi.endpoints.inspectScan.initiate({ file })).unwrap();
    if (inspectRes && inspectRes.success && inspectRes.data?.components?.length > 0) {
      return {
        file,
        fileType: inspectRes.data.fileType || 'json',
        components: inspectRes.data.components,
        warnings: inspectRes.data.warnings || [],
      };
    }
    return null;
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : 'Inspection failed');
  }
});

export const uploadScanThunk = createAsyncThunk<
  unknown,
  { params: UploadScanParams; token?: string },
  { dispatch: AppDispatch; rejectValue: string }
>('scans/uploadScan', async ({ params }, { dispatch, rejectWithValue }) => {
  try {
    const res = await dispatch(scansApi.endpoints.uploadScan.initiate(params)).unwrap();
    return res;
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : 'Upload failed');
  }
});

// ─── Slice Definition ────────────────────────────────────────────────────────

export const scansSlice = createSlice({
  name: 'scans',
  initialState,
  reducers: {
    setInitialScans: (state, action: PayloadAction<SbomScan[]>) => {
      state.items = action.payload;
    },
    setActiveScanProgress: (state, action: PayloadAction<ActiveScanProgress | null>) => {
      state.activeScanProgress = action.payload;
    },
    setReviewModalOpen: (state, action: PayloadAction<boolean>) => {
      state.reviewModalOpen = action.payload;
    },
    setReviewFile: (state, action: PayloadAction<File | null>) => {
      state.reviewFile = action.payload;
    },
    setUploading: (state, action: PayloadAction<boolean>) => {
      state.uploading = action.payload;
    },
    setUploadMessage: (state, action: PayloadAction<string>) => {
      state.uploadMessage = action.payload;
    },
    resetReviewModal: (state) => {
      state.reviewModalOpen = false;
      state.reviewFile = null;
      state.reviewComponents = [];
      state.reviewWarnings = [];
    },
    resetScans: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // Fetch Scans
      .addCase(fetchScansThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchScansThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchScansThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Inspect SBOM
      .addCase(inspectSbomThunk.pending, (state) => {
        state.inspecting = true;
      })
      .addCase(inspectSbomThunk.fulfilled, (state, action) => {
        state.inspecting = false;
        if (action.payload) {
          state.reviewFile = action.payload.file;
          state.reviewFileType = action.payload.fileType;
          state.reviewComponents = action.payload.components;
          state.reviewWarnings = action.payload.warnings;
          state.reviewModalOpen = true;
        }
      })
      .addCase(inspectSbomThunk.rejected, (state) => {
        state.inspecting = false;
      })

      // Upload Scan
      .addCase(uploadScanThunk.pending, (state) => {
        state.uploading = true;
        state.uploadMessage = '';
      })
      .addCase(uploadScanThunk.fulfilled, (state) => {
        state.uploading = false;
        state.reviewModalOpen = false;
        state.reviewFile = null;
      })
      .addCase(uploadScanThunk.rejected, (state, action) => {
        state.uploading = false;
        state.uploadMessage = action.payload as string;
      })
      .addMatcher(
        scansApi.endpoints.getScans.matchFulfilled,
        (state, action) => {
          state.loading = false;
          state.items = action.payload;
        }
      );
  },
});

export const {
  setInitialScans,
  setActiveScanProgress,
  setReviewModalOpen,
  setReviewFile,
  setUploading,
  setUploadMessage,
  resetReviewModal,
  resetScans,
} = scansSlice.actions;

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectAllScans = (state: RootState) => state.scans.items;
export const selectActiveScanProgress = (state: RootState) => state.scans.activeScanProgress;
export const selectIsUploading = (state: RootState) => state.scans.uploading;
export const selectUploadMessage = (state: RootState) => state.scans.uploadMessage;
export const selectIsInspecting = (state: RootState) => state.scans.inspecting;
export const selectReviewModalOpen = (state: RootState) => state.scans.reviewModalOpen;
export const selectReviewFile = (state: RootState) => state.scans.reviewFile;
export const selectReviewFileType = (state: RootState) => state.scans.reviewFileType;
export const selectReviewComponents = (state: RootState) => state.scans.reviewComponents;
export const selectReviewWarnings = (state: RootState) => state.scans.reviewWarnings;

export const selectScopedScans = createSelector(
  [
    selectAllScans,
    (state: RootState) => state.projects?.selectedProjectId || 'all',
  ],
  (scans, selectedProjectId) => {
    return scans.filter((scan) => {
      if (selectedProjectId === 'all') return true;
      const scopedScan = scan as SbomScan & { project_id?: string; projectId?: string };
      const scanProjectId = scopedScan.project_id || scopedScan.projectId;
      return scanProjectId === selectedProjectId || (!scanProjectId && selectedProjectId.endsWith('_default'));
    });
  }
);

export default scansSlice.reducer;
