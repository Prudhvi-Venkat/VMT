import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { Asset } from '@/lib/types';
import { assetsApi, normalizeBackendAsset, type CreateAssetInput } from '../api/assets-api';
import type { RootState, AppDispatch } from '../index';

export interface AssetsState {
  items: Asset[];
  selectedAssetId: string | null;
  viewMode: 'table' | 'graph';
  loading: boolean;
  error: string | null;
}

const initialState: AssetsState = {
  items: [],
  selectedAssetId: null,
  viewMode: 'table',
  loading: false,
  error: null,
};

export { normalizeBackendAsset };

// ─── Async Thunks ────────────────────────────────────────────────────────────

export const fetchAssetsThunk = createAsyncThunk<
  Asset[],
  string | void,
  { dispatch: AppDispatch; rejectValue: string }
>('assets/fetchAssets', async (_, { dispatch, rejectWithValue }) => {
  try {
    const res = await dispatch(assetsApi.endpoints.getAssets.initiate()).unwrap();
    if (res && res.success && Array.isArray(res.data)) {
      return res.data.map((item) => normalizeBackendAsset(item as unknown as Record<string, unknown>));
    }
    return [];
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : 'Failed to fetch assets');
  }
});

export const createAssetThunk = createAsyncThunk<
  Asset,
  { data: CreateAssetInput; token?: string },
  { dispatch: AppDispatch; rejectValue: string }
>('assets/createAsset', async ({ data }, { dispatch, rejectWithValue }) => {
  try {
    const res = await dispatch(assetsApi.endpoints.createAsset.initiate(data)).unwrap();
    if (res && res.success && res.data) {
      return normalizeBackendAsset(res.data as unknown as Record<string, unknown>);
    }
    throw new Error('Failed to create asset');
  } catch (err: unknown) {
    return rejectWithValue(err instanceof Error ? err.message : 'Failed to create asset');
  }
});

// ─── Slice Definition ────────────────────────────────────────────────────────

export const assetsSlice = createSlice({
  name: 'assets',
  initialState,
  reducers: {
    setInitialAssets: (state, action: PayloadAction<Asset[]>) => {
      state.items = action.payload;
      if (!state.selectedAssetId && action.payload.length > 0) {
        state.selectedAssetId = action.payload[0].id;
      }
    },
    setSelectedAssetId: (state, action: PayloadAction<string | null>) => {
      state.selectedAssetId = action.payload;
    },
    setViewMode: (state, action: PayloadAction<'table' | 'graph'>) => {
      state.viewMode = action.payload;
    },
    resetAssets: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // Fetch Assets
      .addCase(fetchAssetsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAssetsThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
        if (!state.selectedAssetId && action.payload.length > 0) {
          state.selectedAssetId = action.payload[0].id;
        }
      })
      .addCase(fetchAssetsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Create Asset
      .addCase(createAssetThunk.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
        state.selectedAssetId = action.payload.id;
      });
  },
});

export const {
  setInitialAssets,
  setSelectedAssetId,
  setViewMode,
  resetAssets,
} = assetsSlice.actions;

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectAllAssets = (state: RootState) => state.assets.items;
export const selectSelectedAssetId = (state: RootState) => state.assets.selectedAssetId;
export const selectAssetViewMode = (state: RootState) => state.assets.viewMode;
export const selectAssetsLoading = (state: RootState) => state.assets.loading;

export const selectActiveFocusAsset = (state: RootState) => {
  const assets = state.assets.items;
  const selectedId = state.assets.selectedAssetId;
  return assets.find((a) => a.id === selectedId) || assets[0] || null;
};

export default assetsSlice.reducer;
