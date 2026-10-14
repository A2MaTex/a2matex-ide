import { create } from 'zustand';

export type BottomPanelTab = 'problems' | 'output' | 'diagnostics';

interface EditorStoreState {
  selectedNodeId: string | null;
  copiedNodeId: string | null;
  paletteQuery: string;
  paletteCategory: string;
  activeBottomTab: BottomPanelTab;
  selectNode(nodeId: string | null): void;
  copyNode(nodeId: string | null): void;
  setPaletteQuery(query: string): void;
  setPaletteCategory(category: string): void;
  setActiveBottomTab(tab: BottomPanelTab): void;
  resetWorkflowSession(): void;
}

export const useEditorStore = create<EditorStoreState>((set) => ({
  selectedNodeId: null,
  copiedNodeId: null,
  paletteQuery: '',
  paletteCategory: 'All',
  activeBottomTab: 'problems',
  selectNode: (selectedNodeId) => set({ selectedNodeId }),
  copyNode: (copiedNodeId) => set({ copiedNodeId }),
  setPaletteQuery: (paletteQuery) => set({ paletteQuery }),
  setPaletteCategory: (paletteCategory) => set({ paletteCategory }),
  setActiveBottomTab: (activeBottomTab) => set({ activeBottomTab }),
  resetWorkflowSession: () =>
    set({
      selectedNodeId: null,
      copiedNodeId: null,
      paletteQuery: '',
      paletteCategory: 'All',
      activeBottomTab: 'problems',
    }),
}));
