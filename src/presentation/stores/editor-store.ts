import { create } from 'zustand';

export type BottomPanelTab = 'problems' | 'output' | 'diagnostics';

interface EditorStoreState {
  selectedNodeId: string | null;
  nodeConfigDrawerOpen: boolean;
  copiedNodeId: string | null;
  paletteQuery: string;
  activeBottomTab: BottomPanelTab;
  selectNode(nodeId: string | null): void;
  closeNodeConfigDrawer(): void;
  copyNode(nodeId: string | null): void;
  setPaletteQuery(query: string): void;
  setActiveBottomTab(tab: BottomPanelTab): void;
  resetWorkflowSession(): void;
}

export const useEditorStore = create<EditorStoreState>((set) => ({
  selectedNodeId: null,
  nodeConfigDrawerOpen: false,
  copiedNodeId: null,
  paletteQuery: '',
  activeBottomTab: 'problems',
  selectNode: (selectedNodeId) =>
    set({ selectedNodeId, nodeConfigDrawerOpen: selectedNodeId !== null }),
  closeNodeConfigDrawer: () => set({ nodeConfigDrawerOpen: false }),
  copyNode: (copiedNodeId) => set({ copiedNodeId }),
  setPaletteQuery: (paletteQuery) => set({ paletteQuery }),
  setActiveBottomTab: (activeBottomTab) => set({ activeBottomTab }),
  resetWorkflowSession: () =>
    set({
      selectedNodeId: null,
      nodeConfigDrawerOpen: false,
      copiedNodeId: null,
      paletteQuery: '',
      activeBottomTab: 'problems',
    }),
}));
