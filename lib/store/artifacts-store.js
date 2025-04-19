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
         * Creates or resets an artifact entry when its starting tag is detected.
         * If the artifact ID already exists and is complete, it resets the content
         * and metadata for a "rewrite" update.
         * @param {string} artifactId - The unique ID for this artifact (from tag or context).
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
            const existingArtifact = conversationArtifacts[artifactId];

            if (existingArtifact) {
              // Handle existing artifact: Rewrite Update or Continuation Start
              if (existingArtifact.isComplete) {
                // --- Rewrite Update Scenario ---
                console.log(`Rewriting completed artifact: ${artifactId}`);
                existingArtifact.content = ''; // Reset content
                existingArtifact.isComplete = false; // Mark as incomplete for new stream
                existingArtifact.type = metadata?.type || existingArtifact.type || 'unknown'; // Update type
                existingArtifact.metadata = { ...existingArtifact.metadata, ...metadata }; // Merge metadata, new values overwrite
                // Optionally add/update an 'updatedAt' timestamp
                // existingArtifact.updatedAt = new Date().toISOString();
              } else {
                // --- Continuation or Duplicate Start Scenario ---
                // If it's already incomplete, we assume it's either a continuation
                // (where _startArtifact might be called again if logic isn't perfect)
                // or a duplicate start call during initial streaming.
                // In either case, we don't want to reset the content.
                // We might update metadata if new info is provided.
                console.warn(`Artifact ${artifactId} already started and is incomplete. Updating metadata if changed.`);
                existingArtifact.type = metadata?.type || existingArtifact.type || 'unknown';
                existingArtifact.metadata = { ...existingArtifact.metadata, ...metadata };
              }
            } else {
              // --- New Artifact Scenario ---
              conversationArtifacts[artifactId] = {
                id: artifactId,
                type: metadata?.type || 'unknown',
                metadata: metadata || {},
                conversationId: conversationId,
                createdAt: new Date().toISOString(),
                content: '', // Initialize content as empty
                isComplete: false // Mark as incomplete initially
              };
            }
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
            // Append content regardless of isComplete status during streaming,
            // as _startArtifact handles resetting for rewrites.
            artifact.content += contentChunk;
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
              // Only mark complete if it's not already marked (minor safeguard)
              if (!artifact.isComplete) {
                  artifact.isComplete = true;
                  // Optionally add/update an 'updatedAt' timestamp
                  artifact.updatedAt = new Date().toISOString();
              }
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