import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Zustand store for managing artifacts generated during conversations,
 * designed for incremental updates via a streaming parser.
 *
 * State Structure:
 * {
 *   artifactsByConversation: {
 *     [conversationId]: {
 *       [artifactId]: {
 *         id: string,
 *         type: string, // e.g., 'code', 'html', 'json'
 *         metadata: object, // e.g., { language: 'python', filename: 'script.py' }
 *         conversationId: string,
 *         createdAt: string, // ISO timestamp when <artifact> tag was first detected
 *         content: string, // The incrementally built content of the artifact
 *         isComplete: boolean // Flag indicating if the closing </artifact> tag has been processed
 *       }
 *     }
 *   }
 * }
 */
export const useArtifactsStore = create(
  // 1. Immer for direct state mutation syntax
  immer(
    // 2. Persist middleware for saving/loading from localStorage
    persist(
      (set, get) => ({
        // --- State ---
        artifactsByConversation: {},

        // --- Actions (designed for streaming parser) ---

        /**
         * Creates the initial entry for an artifact when its starting tag is detected.
         * @param {string} artifactId - The pre-generated unique ID for this artifact.
         * @param {object} metadata - The metadata extracted from the artifact tag attributes.
         * @param {string} conversationId - The ID of the conversation.
         */
        _startArtifact: (artifactId, metadata, conversationId) => {
          set(state => {
            if (!artifactId || !conversationId) {
              console.error("Artifact ID or Conversation ID is missing for _startArtifact.");
              return;
            }

            // Ensure the conversation entry exists
            if (!state.artifactsByConversation[conversationId]) {
              state.artifactsByConversation[conversationId] = {};
            }
            const conversationArtifacts = state.artifactsByConversation[conversationId];

            // Avoid overwriting if called multiple times for the same ID (e.g., retry logic)
            if (conversationArtifacts[artifactId]) {
              console.warn(`Artifact ${artifactId} already started. Ignoring duplicate start call.`);
              return;
            }

            conversationArtifacts[artifactId] = {
              id: artifactId,
              type: metadata?.type || 'unknown', // Extract type from metadata
              metadata: metadata || {},
              conversationId: conversationId,
              createdAt: new Date().toISOString(),
              content: '', // Initialize content as empty
              isComplete: false // Mark as incomplete initially
            };
          });
        },

        /**
         * Appends a chunk of content to an existing artifact.
         * @param {string} artifactId - The ID of the artifact to update.
         * @param {string} contentChunk - The piece of content to append.
         * @param {string} conversationId - The ID of the conversation (needed to find the artifact).
         */
        _appendArtifactContent: (artifactId, contentChunk, conversationId) => {
          set(state => {
            const artifact = state.artifactsByConversation[conversationId]?.[artifactId];
            if (!artifact) {
              // This might happen if append is called before start, log warning
              console.warn(`Attempted to append content to non-existent artifact: Conv ${conversationId}, Art ${artifactId}`);
              return;
            }
            // Only append if not yet marked complete (optional safeguard)
            if (!artifact.isComplete) {
              artifact.content += contentChunk;
            } else {
              console.warn(`Attempted to append content to already completed artifact: ${artifactId}`);
            }
          });
        },

        /**
         * Marks an artifact as complete, signifying the closing tag was processed.
         * @param {string} artifactId - The ID of the artifact to mark as complete.
         * @param {string} conversationId - The ID of the conversation (needed to find the artifact).
         */
        _completeArtifact: (artifactId, conversationId) => {
          set(state => {
            const artifact = state.artifactsByConversation[conversationId]?.[artifactId];
            if (artifact) {
              artifact.isComplete = true;
            } else {
              console.warn(`Attempted to complete non-existent artifact: Conv ${conversationId}, Art ${artifactId}`);
            }
          });
        },

        /**
         * Removes all artifacts associated with a specific conversation.
         * Intended to be called when a conversation is deleted.
         * @param {string} conversationId - The ID of the conversation whose artifacts should be removed.
         */
        _removeConversationArtifacts: (conversationId) => {
          set(state => {
            if (state.artifactsByConversation[conversationId]) {
              delete state.artifactsByConversation[conversationId];
            }
          });
        },

        // --- Selectors / Getters ---

        /**
         * Gets all artifacts for a specific conversation.
         * @param {string} conversationId - The ID of the conversation.
         * @returns {object} A map of artifactId to artifact object, or an empty object if none exist.
         */
        getArtifactsForConversation: (conversationId) => {
          return get().artifactsByConversation[conversationId] || {};
        },

        /**
         * Gets a specific artifact object by its ID within a conversation.
         * @param {string} conversationId - The ID of the conversation.
         * @param {string} artifactId - The ID of the artifact.
         * @returns {object | undefined} The artifact object or undefined if not found.
         */
        getArtifact: (conversationId, artifactId) => {
          return get().artifactsByConversation[conversationId]?.[artifactId];
        },

        /**
         * Gets the full content of a specific artifact (regardless of completion status).
         * Useful for the UI component rendering the artifact.
         * @param {string} conversationId - The ID of the conversation.
         * @param {string} artifactId - The ID of the artifact.
         * @returns {string | null} The content string or null if not found.
         */
        getArtifactContent: (conversationId, artifactId) => {
          return get().artifactsByConversation[conversationId]?.[artifactId]?.content ?? null;
        },

      }),
      {
        // Persist configuration
        name: 'chatgpt-clone-artifacts-storage-v2', // Use a new name to avoid conflicts with old structure
        storage: createJSONStorage(() => localStorage),
      }
    ) // End persist
  ) // End immer
);

// --- Optional: Connect to Conversation Store Deletion ---
// (Same logic as before, subscribing to conversation deletions)
if (typeof window !== 'undefined') {
  import('./conversations-store').then(({ useConversationsStore }) => {
    useConversationsStore.subscribe(
      (state, prevState) => {
        const deletedConversationIds = Object.keys(prevState.conversations).filter(
          id => !state.conversations[id]
        );
        if (deletedConversationIds.length > 0) {
          const removeArtifactsAction = useArtifactsStore.getState()._removeConversationArtifacts;
          deletedConversationIds.forEach(id => {
            console.log(`Removing artifacts for deleted conversation: ${id}`);
            removeArtifactsAction(id);
          });
        }
      },
      state => Object.keys(state.conversations)
    );
  }).catch(error => {
    console.error("Failed to dynamically import conversations-store for artifact cleanup subscription:", error);
  });
}