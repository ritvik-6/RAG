import { create } from 'zustand';

export const useUiStore = create((set) => ({
  sidebarCollapsed: false,
  runtimeStatus: 'System standby.',
  inputEnabled: false,
  activeCitationKey: null,
  activeSidebarTab: 'sessions',

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setRuntimeStatus: (runtimeStatus) => set({ runtimeStatus }),

  setInputEnabled: (inputEnabled) => set({ inputEnabled }),

  setActiveCitationKey: (activeCitationKey) => set({ activeCitationKey }),

  setActiveSidebarTab: (activeSidebarTab) => set({ activeSidebarTab }),
}));
