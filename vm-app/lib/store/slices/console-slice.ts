import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ConsoleView } from '@/lib/types';
import type { RootState } from '../index';

export interface ConsoleState {
  activeView: ConsoleView;
  exportScan: { id: string; name?: string } | null;
}

const initialState: ConsoleState = {
  activeView: 'overview',
  exportScan: null,
};

export const consoleSlice = createSlice({
  name: 'console',
  initialState,
  reducers: {
    setActiveView: (state, action: PayloadAction<ConsoleView>) => {
      state.activeView = action.payload;
    },
    setExportScan: (state, action: PayloadAction<{ id: string; name?: string } | null>) => {
      state.exportScan = action.payload;
    },
  },
});

export const {
  setActiveView,
  setExportScan,
} = consoleSlice.actions;

// Selectors
export const selectActiveView = (state: RootState) => state.console.activeView;
export const selectConsoleExportScan = (state: RootState) => state.console.exportScan;

export default consoleSlice.reducer;
