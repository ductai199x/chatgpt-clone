import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import { generateId } from '@/lib/utils';

/**
 * Zustand store for managing artifacts generated during conversations,
 * supporting multiple versions per artifact and incremental updates.
 *
 * State Structure:
 * {
 *   artifactsByConversation: {
 *     [conversationId]: {
 *       [artifactId]: { // Artifact Container
 *         id: string, // e.g., "art-123"
 *         conversationId: string,
 *         versions: [ // Array of artifact versions
 *           {
 *             id: string, // Unique version ID, e.g., "art-ver-aaa"
 *             content: string,
 *             metadata: object, // { filename, language, etc. }
 *             type: string,
 *             isComplete: boolean, // Did *this version's* stream complete?
 *             createdAt: string, // ISO timestamp for this version
 *           }
 *         ],
 *         activeVersionId: string // ID of the currently active version
 *       }
 *     }
 *   }
 * }
 */
export const useArtifactsStore = create(
  immer(
    persist(
      (set, get) => ({
        // --- State ---
        artifactsByConversation: {},

        // --- Actions ---

        /**
         * Handles the start of an artifact stream.
         * Creates the artifact container if it doesn't exist.
         * Creates a new version if it's a new artifact or a rewrite of a completed one.
         * Sets the new/current version as active.
         * @param {string} artifactId - The unique ID for this artifact.
         * @param {object} metadata - Metadata from the artifact tag.
         * @param {string} conversationId - The ID of the conversation.
         */
        _startArtifact: (artifactId, metadata, conversationId) => {
          set(state => {
            if (!artifactId || !conversationId) {
              console.error("Artifact ID or Conversation ID is missing for _startArtifact.");
              return;
            }

            if (!state.artifactsByConversation[conversationId]) {
              state.artifactsByConversation[conversationId] = {};
            }
            const conversationArtifacts = state.artifactsByConversation[conversationId];
            let artifactContainer = conversationArtifacts[artifactId];

            const createNewVersion = (meta) => ({
              id: generateId('art-ver'),
              content: '',
              metadata: meta || {},
              type: meta?.type || 'unknown',
              isComplete: false,
              createdAt: new Date().toISOString(),
            });

            if (!artifactContainer) {
              // --- New Artifact Scenario ---
              console.log(`Starting new artifact: ${artifactId}`);
              const firstVersion = createNewVersion(metadata);
              artifactContainer = {
                id: artifactId,
                conversationId: conversationId,
                versions: [firstVersion],
                activeVersionId: firstVersion.id,
              };
              conversationArtifacts[artifactId] = artifactContainer;
            } else {
              // --- Existing Artifact Scenario ---
              const activeVersion = artifactContainer.versions.find(v => v.id === artifactContainer.activeVersionId);

              if (activeVersion?.isComplete) {
                // --- Rewrite Update Scenario ---
                console.log(`Rewriting completed artifact: ${artifactId}. Creating new version.`);
                const newVersion = createNewVersion(metadata);
                // Merge metadata: new values overwrite, keep old if not provided in new
                newVersion.metadata = { ...activeVersion.metadata, ...metadata };
                newVersion.type = metadata?.type || activeVersion.type || 'unknown'; // Prioritize new type

                artifactContainer.versions.push(newVersion);
                artifactContainer.activeVersionId = newVersion.id; // Make the new version active
              } else {
                // --- Continuation or Duplicate Start Scenario ---
                console.warn(`Artifact ${artifactId} already started and active version ${artifactContainer.activeVersionId} is incomplete. Updating metadata if changed.`);
                if (activeVersion && metadata) {
                  // Update metadata of the *existing* incomplete active version
                  activeVersion.metadata = { ...activeVersion.metadata, ...metadata };
                  activeVersion.type = metadata?.type || activeVersion.type || 'unknown';
                }
              }
            }
          });
        },

        /**
         * Appends a chunk of content to the *active version* of an artifact.
         * @param {string} artifactId - The ID of the artifact container.
         * @param {string} contentChunk - The piece of content to append.
         * @param {string} conversationId - The ID of the conversation.
         */
        _appendArtifactContent: (artifactId, contentChunk, conversationId) => {
          set(state => {
            const artifactContainer = state.artifactsByConversation[conversationId]?.[artifactId];
            if (!artifactContainer) {
              console.warn(`[_appendArtifactContent] Artifact container not found: Conv ${conversationId}, Art ${artifactId}`);
              return;
            }
            const activeVersion = artifactContainer.versions.find(v => v.id === artifactContainer.activeVersionId);
            if (!activeVersion) {
               console.warn(`[_appendArtifactContent] Active version (${artifactContainer.activeVersionId}) not found for artifact: ${artifactId}`);
               return;
            }
            // Append content to the active version
            activeVersion.content += contentChunk;
          });
        },

        /**
         * Marks the *active version* of an artifact as complete.
         * @param {string} artifactId - The ID of the artifact container.
         * @param {string} conversationId - The ID of the conversation.
         */
        _completeArtifact: (artifactId, conversationId) => {
          set(state => {
            const artifactContainer = state.artifactsByConversation[conversationId]?.[artifactId];
            if (!artifactContainer) {
              console.warn(`[_completeArtifact] Artifact container not found: Conv ${conversationId}, Art ${artifactId}`);
              return;
            }
             const activeVersion = artifactContainer.versions.find(v => v.id === artifactContainer.activeVersionId);
            if (!activeVersion) {
               console.warn(`[_completeArtifact] Active version (${artifactContainer.activeVersionId}) not found for artifact: ${artifactId}`);
               return;
            }

            if (!activeVersion.isComplete) {
              activeVersion.isComplete = true;
              // Optionally add/update an 'updatedAt' timestamp *to the version*
              // activeVersion.updatedAt = new Date().toISOString();
            }
          });
        },

        _removeConversationArtifacts: (conversationId) => {
          set(state => {
            if (state.artifactsByConversation[conversationId]) {
              delete state.artifactsByConversation[conversationId];
            }
          });
        },

        /**
         * Changes the active version for a given artifact.
         * @param {string} conversationId - The ID of the conversation.
         * @param {string} artifactId - The ID of the artifact container.
         * @param {string} newVersionId - The ID of the version to make active.
         */
        switchActiveArtifactVersion: (conversationId, artifactId, newVersionId) => {
          set(state => {
            const artifactContainer = state.artifactsByConversation[conversationId]?.[artifactId];

            if (!artifactContainer) {
              console.warn(`[switchActiveArtifactVersion] Artifact container not found: Conv ${conversationId}, Art ${artifactId}`);
              return;
            }

            if (artifactContainer.activeVersionId === newVersionId) {
              // Already the active version, do nothing.
              return;
            }

            const versionExists = artifactContainer.versions.some(v => v.id === newVersionId);
            if (!versionExists) {
              console.warn(`[switchActiveArtifactVersion] Target version ID (${newVersionId}) not found in artifact ${artifactId}.`);
              return;
            }

            // Update the active version ID
            artifactContainer.activeVersionId = newVersionId;
            console.log(`[switchActiveArtifactVersion] Switched artifact ${artifactId} to version ${newVersionId}`);
          });
        },

        // --- Selectors / Getters ---

        /**
         * Gets all artifacts for a specific conversation.
         * @param {string} conversationId - The ID of the conversation.
         * @returns {object} A map of artifactId to artifact container object, or an empty object if none exist.
         */
        getArtifactsForConversation: (conversationId) => {
          return get().artifactsByConversation[conversationId] || {};
        },

        /**
         * Gets a specific artifact container object (including all versions) by its ID.
         * @param {string} conversationId - The ID of the conversation.
         * @param {string} artifactId - The ID of the artifact container.
         * @returns {object | undefined} The artifact container object or undefined if not found.
         */
        getArtifact: (conversationId, artifactId) => {
          // Returns the whole container now
          return get().artifactsByConversation[conversationId]?.[artifactId];
        },

        /**
         * Gets the content of the *active version* of a specific artifact.
         * @param {string} conversationId - The ID of the conversation.
         * @param {string} artifactId - The ID of the artifact container.
         * @returns {string | null} The content string of the active version or null if not found.
         */
        getArtifactContent: (conversationId, artifactId) => {
          const artifactContainer = get().artifactsByConversation[conversationId]?.[artifactId];
          if (!artifactContainer) return null;
          const activeVersion = artifactContainer.versions.find(v => v.id === artifactContainer.activeVersionId);
          return activeVersion?.content ?? null;
        },

        /**
         * Gets the active version object of a specific artifact.
         * Useful for UI components needing metadata, content, and completion status.
         * @param {string} conversationId - The ID of the conversation.
         * @param {string} artifactId - The ID of the artifact container.
         * @returns {object | null} The active version object or null if not found.
         */
        getActiveArtifactVersion: (conversationId, artifactId) => {
          const artifactContainer = get().artifactsByConversation[conversationId]?.[artifactId];
          if (!artifactContainer) return null;
          return artifactContainer.versions.find(v => v.id === artifactContainer.activeVersionId) || null;
        }

      }),
      {
        name: 'chatgpt-clone-artifacts-storage-v3', // <<< CHANGED version number
        storage: createJSONStorage(() => localStorage),
        // Add migration logic if needed later
      }
    )
  )
);

// --- Optional: Connect to Conversation Store Deletion ---
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