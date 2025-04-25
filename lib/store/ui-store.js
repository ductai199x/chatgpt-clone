'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

/**
 * Zustand store for managing global UI states like sidebars, modals etc.
 */
export const useUIStore = create(immer((set) => ({
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

  // --- Transient State for Inline Reference Insertion ---
  /** @type {{ id: string, timestamp: number } | null} Signals MessageInput to insert a reference */
  referenceToInsert: null,

  // --- Action to trigger insertion ---
  requestReferenceInsert: (artifactId) => {
    set({
      referenceToInsert: { id: artifactId, timestamp: Date.now() } // Use timestamp to ensure effect triggers
    });
  },

  // --- Action for MessageInput to clear the request ---
  clearReferenceInsertRequest: () => {
    set({ referenceToInsert: null });
  },

  // --- Add other UI states here if needed in the future ---
  // e.g., isSettingsModalOpen, etc.
})));