import { create } from 'zustand';

export type BottomPanelTab = 'problems' | 'output' | 'diagnostics';

export interface NodeDefinitionTarget {
  type: string;
  version: number;
}

interface EditorStoreState {
  selectedNodeId: string | null;
  nodeConfigDrawerOpen: boolean;
  nodeConfigNodeId: string | null;
  nodeDetailNodeId: string | null;
  helpTarget: NodeDefinitionTarget | null;
  selectedEdgeId: string | null;
  copiedNodeId: string | null;
  paletteQuery: string;
  activeBottomTab: BottomPanelTab;
  selectNode(nodeId: string | null): void;
  openNodeConfigDrawer(nodeId: string): void;
  closeNodeConfigDrawer(): void;
  openNodeDetail(nodeId: string): void;
  closeNodeDetail(): void;
  openHelp(target: NodeDefinitionTarget): void;
  closeHelp(): void;
  selectEdge(edgeId: string | null): void;
  copyNode(nodeId: string | null): void;
  setPaletteQuery(query: string): void;
  setActiveBottomTab(tab: BottomPanelTab): void;
  resetWorkflowSession(): void;
}

export const useEditorStore = create<EditorStoreState>((set) => ({
  selectedNodeId: null,
  nodeConfigDrawerOpen: false,
  nodeConfigNodeId: null,
  nodeDetailNodeId: null,
  helpTarget: null,
  selectedEdgeId: null,
  copiedNodeId: null,
  paletteQuery: '',
  activeBottomTab: 'problems',
  selectNode: (selectedNodeId) => set({ selectedNodeId, selectedEdgeId: null }),
  openNodeConfigDrawer: (nodeConfigNodeId) =>
    set({
      selectedNodeId: nodeConfigNodeId,
      selectedEdgeId: null,
      nodeConfigNodeId,
      nodeConfigDrawerOpen: true,
    }),
  closeNodeConfigDrawer: () => set({ nodeConfigDrawerOpen: false, nodeConfigNodeId: null }),
  openNodeDetail: (nodeDetailNodeId) =>
    set({
      selectedNodeId: nodeDetailNodeId,
      selectedEdgeId: null,
      nodeDetailNodeId,
    }),
  closeNodeDetail: () => set({ nodeDetailNodeId: null }),
  openHelp: (helpTarget) => set({ helpTarget }),
  closeHelp: () => set({ helpTarget: null }),
  selectEdge: (selectedEdgeId) =>
    set({ selectedEdgeId, ...(selectedEdgeId ? { selectedNodeId: null } : {}) }),
  copyNode: (copiedNodeId) => set({ copiedNodeId }),
  setPaletteQuery: (paletteQuery) => set({ paletteQuery }),
  setActiveBottomTab: (activeBottomTab) => set({ activeBottomTab }),
  resetWorkflowSession: () =>
    set({
      selectedNodeId: null,
      nodeConfigDrawerOpen: false,
      nodeConfigNodeId: null,
      nodeDetailNodeId: null,
      helpTarget: null,
      selectedEdgeId: null,
      copiedNodeId: null,
      paletteQuery: '',
      activeBottomTab: 'problems',
    }),
}));
