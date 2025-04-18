'use client';

import { create } from 'zustand';

/**
 * Zustand store for managing global UI states like sidebars, modals etc.
 */
export const useUIStore = create((set) => ({
  // --- Artifact Sidebar State ---
  isArtifactSidebarOpen: false,
  activeArtifactId: null,
  activeArtifactConversationId: null, // Needed to fetch the correct artifact

  // --- Actions ---
  openArtifactSidebar: (artifactId, conversationId) => set({
    isArtifactSidebarOpen: true,
    activeArtifactId: artifactId,
    activeArtifactConversationId: conversationId,
  }),

  closeArtifactSidebar: () => set({
    isArtifactSidebarOpen: false,
    activeArtifactId: null,
    activeArtifactConversationId: null,
  }),

  // --- Add other UI states here if needed in the future ---
  // e.g., isSettingsModalOpen, etc.
}));