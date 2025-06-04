'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, createJSONStorage } from 'zustand/middleware';
import { generateId } from '@/lib/utils';
import { createStreamingArtifactParser } from '@/lib/utils/streaming-artifact-parser';
import { handleOpenAIStream, handleAnthropicStream, handleGoogleAIStream } from '@/lib/utils/streaming-handler';
import { formatMessagesForProvider } from '@/lib/utils/chat';
import { createApiService } from '@/lib/api/api-service';
import { useSettingsStore } from '@/lib/store/settings-store';


// --- Store Definition ---
export const useChatStore = create(
  immer(
    persist(
      (set, get) => ({
        // --- State Structure ---

        /**
         * Main state object holding all conversations.
         * @type {Record<string, {
        *   id: string,
        *   title: string,
        *   createdAt: string,
        *   updatedAt: string,
        *   firstMessageNodeId: string | null,
        *   message_nodes: Record<string, {
        *      id: string,
        *      type: 'message',
        *      role: 'user' | 'assistant',
        *      content: string | object[], // Can contain <artifactrenderer id="art-xyz">
        *      createdAt: string,
        *      nextMessageId: string | null, // ID of the next message node in the active chain
        *      childrenMessageIds: string[], // IDs of alternative next messages (for branching/regeneration)
        *      artifactsCreated: string[], // IDs of the *specific* artifact nodes created or updated by this message version
        *      isIncomplete?: boolean,
        *      incompleteArtifactId?: string | null // ID of the artifact node if message ended mid-stream
        *      referencedNodeIds?: string[], // IDs of referenced nodes (for context)
        *      reasoning?: string | null, // Stores the finalized reasoning summary text
        *      isReasoningInProgress?: boolean, // True when reasoning starts, false when summary is done
        *      reasoningStartTime?: number | null, // Timestamp to calculate duration
        *      reasoningDurationMs?: number | null, // Calculated duration for "Thought for..."
        *   }>,
        *   artifact_nodes: Record<string, {
        *      id: string,
        *      type: 'artifact',
        *      content: string,
        *      metadata: {
        *          type?: string, // e.g., 'code', 'html', 'text'
        *          language?: string,
        *          filename?: string, // Can also store file path
        *          title?: string,
        *      },
        *      createdAt: string,
        *      nextArtifactId: string | null, // ID of the next version of this artifact
        *      prevArtifactId: string | null, // ID of the previous version of this artifact
        *      isComplete: boolean
        *   }>,
        * }>}
        */
        conversations: {},

        /** @type {string | null} */
        activeConversationId: null,

        isLoading: false,
        error: null,

        // == Conversation Management ==
        addConversation: (id, title) => {
          set(state => {
            if (!state.conversations[id]) {
              state.conversations[id] = {
                id,
                title,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                firstMessageNodeId: null,
                message_nodes: {},
                artifact_nodes: {},
              };
              state.activeConversationId = id;
            }
          });
        },
        setActiveConversation: (conversationId) => {
          set({ activeConversationId: conversationId });
        },
        deleteConversation: (conversationId) => {
          set(state => {
            if (state.conversations[conversationId]) {
              delete state.conversations[conversationId];
              console.log(`[deleteConversation] Deleted conversation ${conversationId}.`);
              // If the deleted one was active, set active to null or another conv
              if (state.activeConversationId === conversationId) {
                const remainingIds = Object.keys(state.conversations);
                state.activeConversationId = remainingIds.length > 0 ? remainingIds[0] : null;
              }
            } else {
              console.warn(`[deleteConversation] Conversation ${conversationId} not found.`);
            }
          });
        },
        renameConversation: (conversationId, newTitle) => {
          set(state => {
            if (state.conversations[conversationId]) {
              state.conversations[conversationId].title = newTitle;
              state.conversations[conversationId].updatedAt = new Date().toISOString();
            }
          });
        },
        clearAllConversations: () => {
          set(state => {
            state.conversations = {};
            state.activeConversationId = null;
            console.log('[clearAllConversations] All conversations cleared.');
          });
        },

        // == Message Management ==
        sendMessage: async (conversationId, userContent, referencedNodeIds = []) => {
          // --- Get settings ---
          const settings = useSettingsStore.getState();
          const {
            currentProvider,
            currentModel,
            providers,
            systemPrompt,
            temperature,
            maxTokens
          } = settings;
          const apiKey = providers[currentProvider]?.apiKey;

          // --- API Key Check ---
          if (!apiKey) {
            set({ isLoading: false, error: `API key for ${currentProvider} is not set.` });
            return;
          }

          // --- 1. Set Loading State & Clear Error ---
          set({ isLoading: true, error: null });

          let userMessageNodeId = null;
          let assistantNodeId = null; // Keep assistantNodeId in scope for catch block
          let previousIncompleteNodeId = null;
          let initialArtifactIdForParser = null;
          let isContinuation = false;

          try {
            // --- 2. Add User Message Node ---
            userMessageNodeId = generateId('msg');
            get()._addMessageNode(conversationId, {
              id: userMessageNodeId,
              role: 'user',
              content: userContent, // Can be string or multimodal array
              referencedNodeIds: referencedNodeIds,
            });

            // --- 3. Check for Continuation ---
            const activeChain = get()._getActiveMessageChain(conversationId);
            const potentialPreviousNode = activeChain.length > 1 ? activeChain[activeChain.length - 2] : null;

            if (potentialPreviousNode && potentialPreviousNode.role === 'assistant' && potentialPreviousNode.isIncomplete) {
              const isExplicitContinue = (typeof userContent === 'string' && userContent.trim().toLowerCase() === 'continue');
              if (isExplicitContinue) {
                isContinuation = true;
                previousIncompleteNodeId = potentialPreviousNode.id; // Store the ID of the incomplete node
                initialArtifactIdForParser = potentialPreviousNode.incompleteArtifactId;
                console.log(`[sendMessage] Detected continuation for message ${previousIncompleteNodeId}, artifact ${initialArtifactIdForParser}`);
              }
            }

            // --- 4. Prepare Context ---
            const contextData = get()._prepareApiContext(
              conversationId,
              referencedNodeIds,
              null // formatUntilMessageId
            );

            if (!contextData) {
              throw new Error("Failed to prepare API context.");
            }

            // --- 5. Format for Provider ---
            // Pass the necessary data to the modified formatter
            const messagesForApi = formatMessagesForProvider({
              rawMessageChain: contextData.rawMessageChain,
              artifactContextString: contextData.artifactContextString,
              currentUserContent: userContent, // Pass the original user content
              provider: currentProvider,
              systemPrompt: systemPrompt,
              isContinuation: isContinuation,
            });
            console.log(`[sendMessage] Messages formatted for ${currentProvider}:`, messagesForApi);


            // --- 6. Make API Call ---
            // Create the appropriate service
            const apiService = createApiService(currentProvider, apiKey);

            // Call chatCompletion
            const apiResponse = await apiService.chatCompletion(
              messagesForApi,
              currentModel,
              {
                temperature: temperature,
                maxTokens: maxTokens,
                stream: true, // Always request streaming
              }
            );

            // --- 7. Add Assistant Node ---
            const assistantNodeId = generateId('msg');
            get()._addMessageNode(conversationId, {
              id: assistantNodeId,
              role: 'assistant',
              content: '', // Start empty
            });

            // --- 8. Handle Response ---
            // Pass the correct structure { stream?, content?, provider }
            await get()._handleApiResponse(
              conversationId,
              assistantNodeId,
              apiResponse,
              initialArtifactIdForParser,
              previousIncompleteNodeId // Pass the ID of the incomplete node being continued
            );

          } catch (error) {
            console.error("Error in sendMessage:", error);
            const errorMsg = `Send message failed: ${error.message}`;
            set(draft => {
              draft.isLoading = false;
              draft.error = errorMsg;

              // Attempt to add error message to the assistant node if it was created
              const assistantNode = draft.conversations[conversationId]?.message_nodes[assistantNodeId];
              if (assistantNode) {
                // Append error to potentially existing (empty) content
                assistantNode.content += `\n\n[Error: ${errorMsg}]`;
                // Mark this node as complete (since the process failed)
                assistantNode.isIncomplete = false;
                assistantNode.incompleteArtifactId = null;
                draft.conversations[conversationId].updatedAt = new Date().toISOString();
              } else {
                // If assistant node wasn't created, the error was more fundamental.
                // Rely on the global error state for UI feedback.
                console.warn("Assistant node not created before error occurred in sendMessage.");
              }
            });
          }
        },
        regenerateResponse: async (conversationId, messageNodeIdToRegenerate) => {
          // --- Get settings ---
          const settings = useSettingsStore.getState();
          const {
            currentProvider,
            currentModel,
            providers,
            systemPrompt,
            temperature,
            maxTokens
          } = settings;
          const apiKey = providers[currentProvider]?.apiKey;

          // --- API Key Check ---
          if (!apiKey) {
            set({ isLoading: false, error: `API key for ${currentProvider} is not set.` });
            return;
          }

          // --- 1. Find Nodes & Validate ---
          const conv = get().conversations[conversationId];
          if (!conv) {
            set({ isLoading: false, error: `Conversation ${conversationId} not found.` });
            return;
          }
          const nodeToRegenerate = conv.message_nodes[messageNodeIdToRegenerate];
          if (!nodeToRegenerate || nodeToRegenerate.role !== 'assistant') {
            set({ isLoading: false, error: `Cannot regenerate: Node ${messageNodeIdToRegenerate} is not a valid assistant message.` });
            return;
          }

          // Find the parent user message node AND the node before the parent
          let parentUserNodeId = null;
          let parentUserNode = null;
          let nodeBeforeParentId = null;
          let nodeBeforeParent = null;

          let tempPrevNodeId = null;
          let currentNodeId = conv.firstMessageNodeId;
          while (currentNodeId) {
            const node = conv.message_nodes[currentNodeId];
            if (!node) break; // Chain broken

            // Check if the current node is the parent of the node being regenerated
            if (node.nextMessageId === messageNodeIdToRegenerate || node.childrenMessageIds.includes(messageNodeIdToRegenerate)) {
              if (node.role === 'user') {
                parentUserNodeId = node.id;
                parentUserNode = node;
                // We found the parent, now get the node before it
                nodeBeforeParentId = tempPrevNodeId; // The node visited just before the parent
                nodeBeforeParent = nodeBeforeParentId ? conv.message_nodes[nodeBeforeParentId] : null;
                break; // Found parent, exit loop
              }
            }
            tempPrevNodeId = currentNodeId; // Store current node ID as potential previous node for the next iteration
            currentNodeId = node.nextMessageId; // Follow the main chain
          }


          if (!parentUserNodeId || !parentUserNode) {
            set({ isLoading: false, error: `Cannot regenerate: Could not find parent user message for ${messageNodeIdToRegenerate}.` });
            return;
          }

          // --- ADD: Check for disallowed regeneration of continuation ---
          const isParentContinueMsg = (typeof parentUserNode.content === 'string' && parentUserNode.content.trim().toLowerCase() === 'continue');
          // Check if the node *before* the "Continue" message was an incomplete assistant message
          if (isParentContinueMsg && nodeBeforeParent && nodeBeforeParent.role === 'assistant' && nodeBeforeParent.isIncomplete) {
            // Prevent regenerating the *result* of a continuation request.
            set({ isLoading: false, error: `Cannot regenerate a response that was itself a continuation. Please edit the original user message or delete the branch.` });
            console.warn(`[regenerateResponse] Disallowed regeneration of continuation response ${messageNodeIdToRegenerate}.`);
            return;
          }
          // --- END CHECK ---

          // --- Retrieve original references from parent ---
          const originalReferences = parentUserNode.referencedNodeIds || [];

          // --- 2. Set Loading State & Clear Error ---
          set({ isLoading: true, error: null });
          let newAssistantNodeId = null; // Keep in scope for catch block

          try {
            // --- 3. Prepare Context (Up to Parent User Message, using original references) ---
            // We need the context *before* the parent user message was sent.
            // So, formatUntilMessageId should be the parentUserNodeId itself.
            const contextData = get()._prepareApiContext(
              conversationId,
              originalReferences, // Use original references from parent
              parentUserNodeId // Get history *up to* (not including) this node
            );

            if (!contextData) {
              throw new Error("Failed to prepare API context for regeneration.");
            }

            // --- 4. Format for Provider ---
            // The "current user content" for formatting is the content of the parent user node.
            const messagesForApi = formatMessagesForProvider({
              rawMessageChain: contextData.rawMessageChain, // Chain up to parent
              artifactContextString: contextData.artifactContextString, // Context relevant up to parent
              currentUserContent: parentUserNode.content, // Content of the parent user message
              provider: currentProvider,
              systemPrompt: systemPrompt,
              isContinuation: false, // Regeneration is not a continuation
            });
            console.log(`[regenerateResponse] Messages formatted for ${currentProvider}:`, messagesForApi);

            // --- 5. Make API Call ---
            const apiService = createApiService(currentProvider, apiKey);
            const apiResponse = await apiService.chatCompletion(
              messagesForApi,
              currentModel,
              { temperature, maxTokens, stream: true }
            );

            // --- 6. Add New Assistant Node & Link Branch ---
            newAssistantNodeId = generateId('msg');
            set(state => {
              const currentConv = state.conversations[conversationId];
              if (!currentConv) return; // Should not happen if initial check passed

              // Create the new node
              const newNode = {
                id: newAssistantNodeId,
                type: 'message',
                role: 'assistant',
                content: '', // Start empty
                createdAt: new Date().toISOString(),
                nextMessageId: null, // Will be populated by subsequent messages if this branch continues
                childrenMessageIds: [],
                artifactsCreated: [],
                isIncomplete: false,
                incompleteArtifactId: null,
              };
              currentConv.message_nodes[newAssistantNodeId] = newNode;

              // Update the parent user node
              const parentNode = currentConv.message_nodes[parentUserNodeId];
              if (parentNode) {
                // Add to children if not already there
                if (!parentNode.childrenMessageIds.includes(newAssistantNodeId)) {
                  parentNode.childrenMessageIds.push(newAssistantNodeId);
                }
                // Set as the *active* next message
                parentNode.nextMessageId = newAssistantNodeId;
              } else {
                console.error(`[regenerateResponse] Parent node ${parentUserNodeId} disappeared unexpectedly!`);
              }
              currentConv.updatedAt = newNode.createdAt;
            });

            // --- 7. Handle Response ---
            await get()._handleApiResponse(
              conversationId,
              newAssistantNodeId, // Target the new node
              { ...apiResponse, provider: currentProvider },
              null, // Not a continuation, so no initial artifact ID
              null  // Not a continuation, so no previous incomplete node ID
            );

          } catch (error) {
            console.error("Error in regenerateResponse:", error);
            const errorMsg = `Regeneration failed: ${error.message}`;
            set(draft => {
              draft.isLoading = false;
              draft.error = errorMsg;

              // Attempt to add error message to the *new* assistant node if it was created
              const newAssistantNode = draft.conversations[conversationId]?.message_nodes[newAssistantNodeId];
              if (newAssistantNode) {
                newAssistantNode.content += `\n\n[Error: ${errorMsg}]`;
                newAssistantNode.isIncomplete = false; // Mark complete on error
                draft.conversations[conversationId].updatedAt = new Date().toISOString();
              } else {
                console.warn("New assistant node not created before error occurred in regenerateResponse.");
              }
              // Should we revert the parent's nextMessageId if regeneration fails early?
              // For now, leaving the potentially empty/error node as the active one.
            });
          }
          // isLoading is set to false within _handleApiResponse onDone/onError
        },

        /**
         * Deletes a message node and the entire branch following it.
         * Also removes associated artifact nodes created within the deleted branch.
         * Updates the parent node's links and the conversation's updatedAt timestamp.
         * @param {string} conversationId - The ID of the conversation.
         * @param {string} messageNodeIdToDelete - The ID of the message node where the deletion starts.
         */
        deleteMessageBranch: (conversationId, messageNodeIdToDelete) => {
          set(state => {
            const conv = state.conversations[conversationId];
            if (!conv) {
              console.error(`[deleteMessageBranch] Conversation ${conversationId} not found.`);
              // state.error = `Conversation ${conversationId} not found.`;
              return;
            }

            const nodeToDelete = conv.message_nodes[messageNodeIdToDelete];
            if (!nodeToDelete) {
              console.error(`[deleteMessageBranch] Node ${messageNodeIdToDelete} not found in conversation ${conversationId}.`);
              // state.error = `Node ${messageNodeIdToDelete} not found.`;
              return;
            }

            // --- 1. Find Parent Node ---
            let parentNodeId = null;
            let parentNode = null;
            // Iterate through all nodes to find the one whose child or next is the nodeToDelete
            // This is less efficient than traversing from the start, but safer if the chain is complex/broken
            for (const id in conv.message_nodes) {
              const potentialParent = conv.message_nodes[id];
              if (potentialParent.nextMessageId === messageNodeIdToDelete || potentialParent.childrenMessageIds?.includes(messageNodeIdToDelete)) {
                parentNodeId = id;
                parentNode = potentialParent;
                break;
              }
            }

            // Handle case where the node to delete is the first message
            if (!parentNodeId && conv.firstMessageNodeId === messageNodeIdToDelete) {
              // Deleting the entire conversation essentially
              console.warn(`[deleteMessageBranch] Deleting the first message node (${messageNodeIdToDelete}). This will clear the conversation.`);
              conv.firstMessageNodeId = null;
              conv.message_nodes = {};
              conv.artifact_nodes = {};
              conv.updatedAt = new Date().toISOString();
              return;
            }

            if (!parentNode) {
              console.error(`[deleteMessageBranch] Could not find parent node for ${messageNodeIdToDelete}.`);
              // state.error = `Could not find parent node for ${messageNodeIdToDelete}.`;
              return;
            }

            // --- 2. Collect Nodes in the Branch to Delete ---
            const messageIdsToDelete = new Set();
            const artifactIdsToDelete = new Set();
            const queue = [messageNodeIdToDelete]; // Start with the target node

            while (queue.length > 0) {
              const currentId = queue.shift();
              if (!currentId || messageIdsToDelete.has(currentId)) continue; // Skip if null or already processed

              const currentNode = conv.message_nodes[currentId];
              if (!currentNode) continue; // Skip if node doesn't exist

              messageIdsToDelete.add(currentId);

              // Add artifacts created by this node to the deletion set
              currentNode.artifactsCreated?.forEach(artId => artifactIdsToDelete.add(artId));

              // Add the next node in this specific branch to the queue
              // Important: Only follow the nextMessageId from the *current* node being processed
              if (currentNode.nextMessageId) {
                queue.push(currentNode.nextMessageId);
              }
              // Also add any children that haven't been visited (though typically nextMessageId covers the branch)
              // This ensures cleanup if the data structure has inconsistencies
              currentNode.childrenMessageIds?.forEach(childId => {
                if (!messageIdsToDelete.has(childId)) {
                  queue.push(childId);
                }
              });
            }

            // --- 3. Update Parent Node ---
            // Remove from children list
            if (parentNode.childrenMessageIds) {
              const childIndex = parentNode.childrenMessageIds.indexOf(messageNodeIdToDelete);
              if (childIndex > -1) {
                parentNode.childrenMessageIds.splice(childIndex, 1);
              }
            }

            // If the deleted node was the active next node, update parent's nextMessageId
            if (parentNode.nextMessageId === messageNodeIdToDelete) {
              // Try to set the next active node to the last remaining child, or null
              if (parentNode.childrenMessageIds && parentNode.childrenMessageIds.length > 0) {
                // Default to the last remaining child as the new active branch
                parentNode.nextMessageId = parentNode.childrenMessageIds[parentNode.childrenMessageIds.length - 1];
                console.log(`[deleteMessageBranch] Deleted active branch ${messageNodeIdToDelete}. Switched parent ${parentNodeId} active branch to ${parentNode.nextMessageId}.`);
              } else {
                parentNode.nextMessageId = null; // No other branches left
                console.log(`[deleteMessageBranch] Deleted active branch ${messageNodeIdToDelete}. Parent ${parentNodeId} has no remaining branches.`);
              }
            } else {
              console.log(`[deleteMessageBranch] Deleted inactive branch starting at ${messageNodeIdToDelete}. Parent ${parentNodeId}'s active branch remains ${parentNode.nextMessageId}.`);
            }

            // --- 4. Delete Nodes ---
            messageIdsToDelete.forEach(id => {
              delete conv.message_nodes[id];
            });
            artifactIdsToDelete.forEach(id => {
              // Before deleting artifact, check if its prev/next links need updating (though likely also being deleted)
              const artNode = conv.artifact_nodes[id];
              if (artNode) {
                const prevArt = artNode.prevArtifactId ? conv.artifact_nodes[artNode.prevArtifactId] : null;
                const nextArt = artNode.nextArtifactId ? conv.artifact_nodes[artNode.nextArtifactId] : null;
                if (prevArt && !artifactIdsToDelete.has(prevArt.id)) prevArt.nextArtifactId = artNode.nextArtifactId; // Link prev to next if prev survives
                if (nextArt && !artifactIdsToDelete.has(nextArt.id)) nextArt.prevArtifactId = artNode.prevArtifactId; // Link next to prev if next survives
              }
              delete conv.artifact_nodes[id];
            });

            // --- 5. Update Timestamp ---
            conv.updatedAt = new Date().toISOString();

            console.log(`[deleteMessageBranch] Deleted ${messageIdsToDelete.size} message nodes and ${artifactIdsToDelete.size} artifact nodes starting from ${messageNodeIdToDelete}.`);
          });
        },

        /**
         * Switches the active message branch following a parent node.
         * Does NOT update the conversation's updatedAt timestamp.
         * @param {string} conversationId - The ID of the conversation.
         * @param {string} parentMessageNodeId - The ID of the parent message node (usually a user message).
         * @param {string} childMessageNodeId - The ID of the child message node (an assistant response) to make active.
         */
        switchActiveMessageBranch: (conversationId, parentMessageNodeId, childMessageNodeId) => {
          set(state => {
            const conv = state.conversations[conversationId];
            if (!conv) {
              console.error(`[switchActiveMessageBranch] Conversation ${conversationId} not found.`);
              // state.error = `Conversation ${conversationId} not found.`;
              return;
            }

            const parentNode = conv.message_nodes[parentMessageNodeId];
            if (!parentNode) {
              console.error(`[switchActiveMessageBranch] Parent node ${parentMessageNodeId} not found in conversation ${conversationId}.`);
              // state.error = `Parent node ${parentMessageNodeId} not found.`;
              return;
            }

            // Validate that the target child is actually a child of the parent
            if (!parentNode.childrenMessageIds || !parentNode.childrenMessageIds.includes(childMessageNodeId)) {
              console.error(`[switchActiveMessageBranch] Node ${childMessageNodeId} is not a child of node ${parentMessageNodeId}.`);
              // state.error = `Node ${childMessageNodeId} is not a valid branch from ${parentMessageNodeId}.`;
              return;
            }

            // Validate that the child node exists
            const childNode = conv.message_nodes[childMessageNodeId];
            if (!childNode) {
              console.error(`[switchActiveMessageBranch] Child node ${childMessageNodeId} not found in conversation ${conversationId}.`);
              // state.error = `Child node ${childMessageNodeId} not found.`;
              return;
            }

            // Check if it's already the active branch
            if (parentNode.nextMessageId === childMessageNodeId) {
              console.log(`[switchActiveMessageBranch] Node ${childMessageNodeId} is already the active branch for parent ${parentMessageNodeId}. No change needed.`);
              return; // No change needed
            }

            // Perform the switch
            parentNode.nextMessageId = childMessageNodeId;

            console.log(`[switchActiveMessageBranch] Switched active branch for parent ${parentMessageNodeId} to child ${childMessageNodeId}.`);
          });
        },

        // == Internal Message/Artifact Handling ==
        _addMessageNode: (conversationId, nodeData) => {
          set(state => {
            const conv = state.conversations[conversationId];
            if (!conv) return;
            const newNode = {
              type: 'message',
              createdAt: new Date().toISOString(),
              nextMessageId: null,
              childrenMessageIds: [],
              artifactsCreated: [],
              isIncomplete: false,
              incompleteArtifactId: null,
              referencedNodeIds: nodeData.role === 'user' ? (nodeData.referencedNodeIds || []) : [],
              reasoning: nodeData.role === 'assistant' ? null : undefined,
              isReasoningInProgress: nodeData.role === 'assistant' ? false : undefined,
              reasoningStartTime: nodeData.role === 'assistant' ? null : undefined,
              reasoningDurationMs: nodeData.role === 'assistant' ? null : undefined,
              ...nodeData, // Includes id, role, content
            };
            conv.message_nodes[newNode.id] = newNode;
            conv.updatedAt = newNode.createdAt;

            // Link to previous or set as first
            const activeChain = get()._getActiveMessageChain(conversationId); // Helper needed
            if (activeChain.length > 0) {
              const prevNodeId = activeChain[activeChain.length - 1].id;
              const prevNode = conv.message_nodes[prevNodeId];
              if (prevNode) {
                prevNode.nextMessageId = newNode.id;
                // Add to children if it's a direct successor (handle branching later)
                if (!prevNode.childrenMessageIds.includes(newNode.id)) {
                  prevNode.childrenMessageIds.push(newNode.id);
                }
              }
            } else {
              conv.firstMessageNodeId = newNode.id;
            }
          });
        },
        _updateMessageNodeContent: (conversationId, nodeId, chunk) => {
          set(state => {
            const node = state.conversations[conversationId]?.message_nodes[nodeId];
            if (node) {
              // Simple string concatenation for now, handle multimodal later
              if (typeof node.content === 'string') {
                node.content += chunk;
              } else {
                // Find text part and append, or add new text part
                const textPartIndex = node.content.findIndex(p => p.type === 'text');
                if (textPartIndex !== -1) {
                  node.content[textPartIndex].text += chunk;
                } else {
                  node.content.push({ type: 'text', text: chunk });
                }
              }
              state.conversations[conversationId].updatedAt = new Date().toISOString();
            }
          });
        },
        _finalizeMessageNode: (conversationId, nodeId, isIncomplete, incompleteArtifactId) => {
          set(state => {
            const node = state.conversations[conversationId]?.message_nodes[nodeId];
            if (node) {
              node.isIncomplete = !!isIncomplete;
              node.incompleteArtifactId = incompleteArtifactId || null;
              if (node.isReasoningInProgress) {
                node.isReasoningInProgress = false;
                if (node.reasoningStartTime && !node.reasoningDurationMs) {
                  node.reasoningDurationMs = Date.now() - node.reasoningStartTime;
                }
                // If reasoning summary is empty, ensure it's null
                if (node.reasoning === '') node.reasoning = null;
              }
              state.conversations[conversationId].updatedAt = new Date().toISOString();
            }
          });
        },
        _setReasoningInProgress: (conversationId, nodeId, isStarting) => {
          set(state => {
            const node = state.conversations[conversationId]?.message_nodes[nodeId];
            if (node && node.role === 'assistant') {
              node.isReasoningInProgress = isStarting;
              if (isStarting) {
                node.reasoningStartTime = Date.now();
                node.reasoning = ''; // Initialize or clear previous reasoning text
                node.reasoningDurationMs = null;
              }
            }
          });
        },
        _appendReasoningSummary: (conversationId, nodeId, summaryChunk) => {
          set(state => {
            const node = state.conversations[conversationId]?.message_nodes[nodeId];
            if (node && node.role === 'assistant') {
              if (node.reasoning === null || node.reasoning === undefined) {
                node.reasoning = '';
              }
              node.reasoning += summaryChunk;
              state.conversations[conversationId].updatedAt = new Date().toISOString();
            }
          });
        },
        _separateReasoningPart: (conversationId, nodeId) => { // New action
          set(state => {
            const node = state.conversations[conversationId]?.message_nodes[nodeId];
            if (node && node.role === 'assistant' && node.reasoning && node.reasoning.length > 0) {
              // Add unique delimiter to separate reasoning steps while preserving natural newlines within steps
              const delimiter = '\n---REASONING_STEP_SEPARATOR---\n';
              if (!node.reasoning.endsWith(delimiter)) {
                node.reasoning += delimiter;
              }
              state.conversations[conversationId].updatedAt = new Date().toISOString();
            }
          });
        },
        _finalizeReasoningSummary: (conversationId, nodeId) => {
          set(state => {
            const node = state.conversations[conversationId]?.message_nodes[nodeId];
            if (node && node.role === 'assistant') {
              node.isReasoningInProgress = false;
              if (node.reasoningStartTime && !node.reasoningDurationMs) {
                node.reasoningDurationMs = Date.now() - node.reasoningStartTime;
              }
              // Trim the accumulated reasoning string
              if (node.reasoning) {
                node.reasoning = node.reasoning.trim();
              } else {
                node.reasoning = null; // Ensure it's null if empty after trimming
              }
              state.conversations[conversationId].updatedAt = new Date().toISOString();
            }
          });
        },
        _createArtifactNode: (conversationId, originatingMessageNodeId, metadata = {}) => {
          let newNodeId = null;
          set(state => {
            const conv = state.conversations[conversationId];
            const originatingNode = conv?.message_nodes[originatingMessageNodeId];
            if (!conv || !originatingNode) {
              console.error(`Cannot create artifact: Conversation ${conversationId} or originating message ${originatingMessageNodeId} not found.`);
              return;
            }

            const generatedId = generateId('art');
            newNodeId = generatedId;
            const newNode = {
              id: generatedId,
              type: 'artifact',
              content: '',
              metadata: metadata || {},
              createdAt: new Date().toISOString(),
              nextArtifactId: null,
              prevArtifactId: null,
              isComplete: false,
            };
            conv.artifact_nodes[generatedId] = newNode;
            originatingNode.artifactsCreated.push(generatedId); // Link to message
            conv.updatedAt = newNode.createdAt;
          });
          return newNodeId; // Return the generated ID
        },
        _updateArtifactNode: (conversationId, originatingMessageNodeId, prevNodeId, metadata = {}) => {
          let newNodeId = null;
          set(state => {
            const conv = state.conversations[conversationId];
            const originatingNode = conv?.message_nodes[originatingMessageNodeId];
            const prevNode = conv?.artifact_nodes[prevNodeId];

            // Verify the previous node exists
            if (!conv || !originatingNode || !prevNode) {
              console.warn(`Attempted to update non-existent artifact node (${prevNodeId}) or missing originating message (${originatingMessageNodeId}).`);
              // Decide: Treat as new artifact creation or fail? Let's fail for now.
              return;
            }

            const generatedId = generateId('art');
            newNodeId = generatedId;
            const newNode = {
              id: generatedId,
              type: 'artifact',
              content: '',
              metadata: metadata || prevNode.metadata,
              createdAt: new Date().toISOString(),
              nextArtifactId: null,
              prevArtifactId: prevNodeId, // Link back to previous version
              isComplete: false,
            };
            conv.artifact_nodes[generatedId] = newNode;
            prevNode.nextArtifactId = generatedId; // Link previous to new
            originatingNode.artifactsCreated.push(generatedId);

            conv.updatedAt = newNode.createdAt;
          });
          return newNodeId;
        },
        _appendArtifactNodeContent: (conversationId, nodeId, chunk) => {
          set(state => {
            const node = state.conversations[conversationId]?.artifact_nodes[nodeId];
            if (node) {
              node.content += chunk;
              state.conversations[conversationId].updatedAt = new Date().toISOString();
            }
          });
        },
        _completeArtifactNode: (conversationId, nodeId) => {
          set(state => {
            const node = state.conversations[conversationId]?.artifact_nodes[nodeId];
            if (node) {
              node.isComplete = true;
              state.conversations[conversationId].updatedAt = new Date().toISOString();
            }
          });
        },
        /**
         * Processes a single action from the streaming artifact parser.
         * @param {string} conversationId
         * @param {string} targetAssistantNodeId
         * @param {object} action - The parser action object.
         * @param {string | null} currentArtifactNodeId - The ID of the artifact currently being processed.
         * @returns {string | null} The updated currentArtifactNodeId.
         */
        _processParserAction: (conversationId, targetAssistantNodeId, action, currentArtifactNodeId) => {
          let updatedArtifactNodeId = currentArtifactNodeId; // Start with the current ID

          switch (action.type) {
            case 'text':
              // Append regular text content to the message
              get()._updateMessageNodeContent(conversationId, targetAssistantNodeId, action.content);
              break; // Keep updatedArtifactNodeId as is

            case 'artifact_start':
              let newNodeId = null;
              const providedId = action.id;
              const conv = get().conversations[conversationId];
              const nodeExists = conv && providedId && conv.artifact_nodes[providedId];
              const isExpectedContinuation = currentArtifactNodeId === providedId;

              if (providedId && nodeExists) { // Check only if ID was provided and node exists
                // --- Scenario 1: Valid Update or Continuation ---
                if (isExpectedContinuation) {
                  // CONTINUATION: Just continue using the same artifact node
                  newNodeId = providedId; // Do NOT create a new version!
                } else {
                  // User-requested update: create a new version
                  newNodeId = get()._updateArtifactNode(conversationId, targetAssistantNodeId, providedId, action.metadata);
                  if (!newNodeId) {
                    console.error(`[_processParserAction] Failed to update artifact node based on ID: ${providedId}`);
                  }
                }
              } else {
                // --- Scenario 2: Treat as NEW Artifact Creation ---
                // Always create a new node if the provided ID doesn't exist (or wasn't provided)
                newNodeId = get()._createArtifactNode(conversationId, targetAssistantNodeId, action.metadata);
                if (!newNodeId) {
                  console.error(`[_processParserAction] Failed to create new artifact node for message: ${targetAssistantNodeId}`);
                }
              }

              updatedArtifactNodeId = newNodeId;

              // Only add a new artifactrenderer tag if this is NOT a continuation and a node was successfully created/updated
              if (newNodeId && !isExpectedContinuation) {
                get()._updateMessageNodeContent(conversationId, targetAssistantNodeId, `<artifactrenderer id="${newNodeId}"></artifactrenderer>`);
              } else if (!newNodeId) {
                // Keep error log if node creation/update failed
                console.error(`[_processParserAction] No newNodeId generated for artifact_start, cannot add renderer tag.`);
              }
              break;

            case 'artifact_content':
              if (updatedArtifactNodeId) { // Use the potentially updated ID from artifact_start
                get()._appendArtifactNodeContent(conversationId, updatedArtifactNodeId, action.content);
              } else {
                // Keep this warning as it indicates a potential state issue
                console.warn("[_processParserAction] Received artifact_content but no currentArtifactNodeId is set. Ignoring content.");
              }
              // Keep updatedArtifactNodeId as is
              break;

            case 'artifact_end':
              if (updatedArtifactNodeId) { // Use the potentially updated ID
                get()._completeArtifactNode(conversationId, updatedArtifactNodeId);
                // Add a newline after the artifact tag in the message content for better spacing
                get()._updateMessageNodeContent(conversationId, targetAssistantNodeId, '\n');
                updatedArtifactNodeId = null; // Reset artifact ID after completion
              } else {
                // Keep this warning
                console.warn("[_processParserAction] Received artifact_end but no currentArtifactNodeId is set.");
              }
              break;

            default:
              console.warn(`[_processParserAction] Unknown action type: ${action.type}`);
          }
          // Return the artifact ID that should be considered "active" after this action
          return updatedArtifactNodeId;
        },

        /**
         * Creates a new version of an artifact based on user edits.
         * Links the new version to the previous one.
         * Does NOT automatically trigger an assistant response.
         * @param {string} conversationId - The ID of the conversation.
         * @param {string} targetNodeId - The ID of the artifact node being edited by the user.
         * @param {string} newContent - The new content provided by the user.
         */
        updateArtifactContentByUser: (conversationId, targetNodeId, newContent) => {
          set(state => {
            const conv = state.conversations[conversationId];
            if (!conv) {
              console.error(`[updateArtifactContentByUser] Conversation ${conversationId} not found.`);
              // state.error = `Conversation ${conversationId} not found.`;
              return;
            }

            const targetNode = conv.artifact_nodes[targetNodeId];
            if (!targetNode) {
              console.error(`[updateArtifactContentByUser] Target artifact node ${targetNodeId} not found.`);
              // state.error = `Target artifact node ${targetNodeId} not found.`;
              return;
            }

            // --- Create New Artifact Version ---
            const newNodeId = generateId('art');
            const newNode = {
              id: newNodeId,
              type: 'artifact',
              content: newContent, // Use the new content from the user
              metadata: { ...targetNode.metadata }, // Copy metadata from previous version
              createdAt: new Date().toISOString(),
              nextArtifactId: null, // This is the latest version for now
              prevArtifactId: targetNodeId, // Link back to the node being edited
              isComplete: true, // User edits are considered complete
            };

            // Add the new node
            conv.artifact_nodes[newNodeId] = newNode;

            // --- Update Links ---
            // Point the previous node's next to this new node
            targetNode.nextArtifactId = newNodeId;
            // Note: If targetNode had a nextArtifactId already (user editing an older version),
            // that link is now broken by this new version insertion. This is generally the desired behavior.

            // --- Update Timestamp ---
            conv.updatedAt = newNode.createdAt;

            console.log(`[updateArtifactContentByUser] Created new artifact version ${newNodeId} from user edit of ${targetNodeId}.`);

            // --- TODO (Future Consideration) ---
            // Should we automatically add a user message like "[User edited artifact xyz]"?
            // Should we automatically trigger an assistant response asking it to acknowledge/use the edit?
            // For now, no automatic follow-up action is taken.
          });
        },

        /**
         * Gathers the raw message chain and artifact context relevant to the current state.
         * Does NOT format messages for a specific provider or inject context.
         * @param {string} conversationId
         * @param {Array<string> | Set<string>} [referencedNodeIds=[]] - Explicitly referenced artifact node IDs.
         * @param {string | null} [formatUntilMessageId=null] - For regeneration, get chain up to this message ID.
         * @returns {{
        *   rawMessageChain: Array<object>,
        *   artifactContextString: string,
        * } | null}
        *   - rawMessageChain: Array of MessageNode objects in the active chain (potentially truncated for regeneration).
        *   - artifactContextString: The formatted <artifacts_context> string based on the active chain and references.
        *   Returns null if conversation not found.
        */
        _prepareApiContext: (conversationId, referencedNodeIds = [], formatUntilMessageId = null) => {
          const conv = get().conversations[conversationId];
          if (!conv) {
            console.error("Cannot prepare context: Conversation not found.");
            return null; // Return null to indicate failure
          }

          // 1. Get Active Message Chain
          const fullActiveMessageChain = get()._getActiveMessageChain(conversationId);
          let rawMessageChain = fullActiveMessageChain;
          let isRegeneration = !!formatUntilMessageId; // Flag if this is for regeneration

          if (isRegeneration) {
            // --- Regeneration Logic ---
            const formatIndex = fullActiveMessageChain.findIndex(node => node.id === formatUntilMessageId);
            if (formatIndex !== -1) {
              // Include messages *up to* (but not including) the formatUntilMessageId node
              rawMessageChain = fullActiveMessageChain.slice(0, formatIndex);
            } else {
              console.warn(`[_prepareApiContext] formatUntilMessageId ${formatUntilMessageId} not found in active chain.`);
              // Fallback: Use the full chain, though this might lead to incorrect context for regeneration
              rawMessageChain = fullActiveMessageChain;
            }
          } else {
            // --- Regular sendMessage Logic ---
            // Exclude the last message (the user message just added) because
            // formatMessagesForProvider will add the currentUserContent separately.
            if (rawMessageChain.length > 0) {
              rawMessageChain = rawMessageChain.slice(0, -1);
            }
          }

          // 2. Determine Artifacts for Context
          // Use the potentially truncated `rawMessageChain` determined above
          const relevantMessageChainForArtifacts = rawMessageChain;
          const referencedArtifactNodeIds = new Set();
          relevantMessageChainForArtifacts.forEach(msgNode => {
            msgNode.artifactsCreated?.forEach(artNodeId => {
              referencedArtifactNodeIds.add(artNodeId);
            });
          });

          const latestNodePerChain = {}; // Map: startNodeId -> latestNodeIdInChain
          const artifactNodes = conv.artifact_nodes; // Local ref

          referencedArtifactNodeIds.forEach(nodeId => {
            let currentNode = artifactNodes[nodeId];
            if (!currentNode) return;

            let startNodeId = currentNode.id;
            let tempNode = currentNode;
            const visited = new Set();
            while (tempNode.prevArtifactId && !visited.has(tempNode.id)) {
              visited.add(tempNode.id);
              const prevNode = artifactNodes[tempNode.prevArtifactId];
              if (!prevNode) {
                console.warn(`Artifact chain broken: Cannot find prev node ${tempNode.prevArtifactId} from ${tempNode.id}`);
                break;
              }
              startNodeId = prevNode.id;
              tempNode = prevNode;
            }
            latestNodePerChain[startNodeId] = nodeId;
          });

          const latestNodesFromChain = Object.values(latestNodePerChain)
            .map(latestId => artifactNodes[latestId])
            .filter(Boolean);

          // Now handle explicitly referenced nodes passed in the arguments
          const nodesForContext = new Map(); // Use Map to ensure unique nodes by ID
          latestNodesFromChain.forEach(node => nodesForContext.set(node.id, node));
          const referencedIdsSet = new Set(referencedNodeIds);
          referencedIdsSet.forEach(refId => {
            const refNode = artifactNodes[refId];
            if (refNode) {
              if (!nodesForContext.has(refId)) {
                nodesForContext.set(refId, refNode);
              }
            } else {
              console.warn(`Referenced artifact node ${refId} not found.`);
            }
          });

          // 3. Format Artifact Context String
          let artifactContextString = '';
          if (nodesForContext.size > 0) {
            artifactContextString = '<artifacts_context>\n';
            nodesForContext.forEach(node => {
              const typeAttr = node.metadata?.type ? ` type="${node.metadata.type}"` : '';
              const langAttr = node.metadata?.language ? ` language="${node.metadata.language}"` : '';
              const filenameAttr = node.metadata?.filename ? ` filename="${node.metadata.filename}"` : '';
              const titleAttr = node.metadata?.title ? ` title="${node.metadata.title}"` : '';
              // const safeContent = (node.content || '').replace(/]]>/g, ']]]]><![CDATA[>');
              artifactContextString += `<artifact id="${node.id}"${typeAttr}${titleAttr}${langAttr}${filenameAttr}>${node.content}</artifact>\n`;
            });
            artifactContextString += '</artifacts_context>\n\n';
          }

          // 4. Return Raw Data
          // IMPORTANT: The caller (sendMessage/regenerateResponse) passes this data to
          // formatMessagesForProvider. formatMessagesForProvider MUST:
          //   a) Prepend `artifactContextString` to the `currentUserContent`.
          //   b) Add the combined content as the final user message.
          //   c) Prepend the system prompt.
          //   d) Handle provider-specific formatting (e.g., Anthropic needs alternating roles).
          return {
            rawMessageChain, // Chain *excluding* the current user message for sendMessage
            artifactContextString
          };
        },

        // == API Response Handling ==
        /**
         * Processes the streaming response from the API.
         * Uses a streaming parser to handle text and artifact tags.
         * Updates message and artifact nodes accordingly.
         * Handles continuation logic for incomplete messages.
         * @param {string} conversationId - The ID of the conversation.
         * @param {string} targetAssistantNodeId - The ID of the assistant message node to update.
         * @param {object} response - The response object { stream?: ReadableStream, content?: string, provider: string }.
         * @param {string | null} [initialArtifactIdForParser=null] - ID if continuing an artifact stream.
         * @param {string | null} [previousIncompleteNodeId=null] - The ID of the assistant message node that was incomplete and is being continued.
         */
        _handleApiResponse: async (
          conversationId,
          targetAssistantNodeId,
          response, // { stream?, content?, provider: string, isReasoningModel?: boolean }
          initialArtifactIdForParser = null,
          previousIncompleteNodeId = null
        ) => {
          let parser = null;

          try {
            if (response.stream) {
              // --- Handle Streaming Response ---
              parser = createStreamingArtifactParser({ initialArtifactId: initialArtifactIdForParser });
              let currentArtifactNodeId = initialArtifactIdForParser; // Track active artifact

              const onChunk = (chunkOrEvent) => {
                const isReasoningModel = response.isReasoningModel;
                if (typeof chunkOrEvent === 'string') {
                  // Process raw text for standard content and artifacts
                  const actions = parser.processChunk(chunkOrEvent);
                  if (actions && actions.length > 0) {
                    actions.forEach(action => {
                      currentArtifactNodeId = get()._processParserAction(conversationId, targetAssistantNodeId, action, currentArtifactNodeId);
                    });
                  }
                } else if (typeof chunkOrEvent === 'object' && chunkOrEvent.type) {
                  // Process structured events
                  switch (chunkOrEvent.type) {
                    case 'reasoning_started':
                      if (isReasoningModel) { // Only process if it's an OpenAI reasoning model
                        get()._setReasoningInProgress(conversationId, targetAssistantNodeId, true);
                      }
                      break;
                    case 'reasoning_summary_delta':
                      if (isReasoningModel) {
                        get()._appendReasoningSummary(conversationId, targetAssistantNodeId, chunkOrEvent.content);
                      }
                      break;
                    case 'reasoning_summary_part_done':
                      if (isReasoningModel) {
                        get()._separateReasoningPart(conversationId, targetAssistantNodeId);
                      }
                      break;
                    case 'reasoning_completed':
                      if (isReasoningModel) {
                        get()._finalizeReasoningSummary(conversationId, targetAssistantNodeId);
                      }
                      break;
                    // For other providers, if they emit similar events, add cases here
                    // e.g., case 'anthropic_some_event': ...
                    default:
                      // If it's not a recognized structured event, try to process its content as text
                      // This handles cases where a provider might send { type: 'text_delta', content: '...' }
                      if (chunkOrEvent.content && typeof chunkOrEvent.content === 'string') {
                        const actions = parser.processChunk(chunkOrEvent.content);
                        if (actions && actions.length > 0) {
                          actions.forEach(action => {
                            currentArtifactNodeId = get()._processParserAction(conversationId, targetAssistantNodeId, action, currentArtifactNodeId);
                          });
                        }
                      } else {
                        console.warn(`[onChunk] Unknown structured event type or missing content:`, chunkOrEvent);
                      }
                  }
                } else {
                  console.warn(`[onChunk] Received unknown chunk type:`, chunkOrEvent);
                }
              };

              const onDone = () => {
                const finalActions = parser.flush(); // Process remaining buffer
                if (finalActions && finalActions.length > 0) {
                  finalActions.forEach(action => {
                    currentArtifactNodeId = get()._processParserAction(conversationId, targetAssistantNodeId, action, currentArtifactNodeId);
                  });
                }

                // Use the *final* state of currentArtifactNodeId after processing final actions
                const isNowIncomplete = parser.isIncomplete(); // Call method
                const incompleteId = parser.getIncompleteArtifactId(); // Call method
                get()._finalizeMessageNode(conversationId, targetAssistantNodeId, isNowIncomplete, incompleteId);

                if (previousIncompleteNodeId && !isNowIncomplete) {
                  console.log(`[onDone] Continuation successful, marking previous message ${previousIncompleteNodeId} as complete.`);
                  get()._finalizeMessageNode(conversationId, previousIncompleteNodeId, false, null); // Use the ID directly
                }
                set(draft => { draft.isLoading = false; });
              };

              const onError = (error) => {
                console.error(`[${response.provider}] Streaming error:`, error);
                const errorContent = '\n\n[I apologize, but an error occurred generating the response.]';
                get()._updateMessageNodeContent(conversationId, targetAssistantNodeId, errorContent);
                get()._finalizeMessageNode(conversationId, targetAssistantNodeId, false, null);
                if (previousIncompleteNodeId) {
                  const prevNode = get().conversations[conversationId]?.message_nodes[previousIncompleteNodeId]; // Use the ID directly
                  if (prevNode && prevNode.isIncomplete) {
                    console.warn(`[onError] Marking previous incomplete message ${previousIncompleteNodeId} as complete due to continuation error.`);
                    get()._finalizeMessageNode(conversationId, previousIncompleteNodeId, false, null); // Use the ID directly
                  }
                }
                set(draft => {
                  draft.error = `Error during ${response.provider} streaming: ${error.message}`;
                  draft.isLoading = false;
                });
              };

              // --- Use Provider-Specific Handlers ---
              const streamHandlers = {
                openai: handleOpenAIStream,
                anthropic: handleAnthropicStream,
                google: handleGoogleAIStream,
              };
              const handler = streamHandlers[response.provider];
              if (handler) {
                await handler(response.stream, onChunk, onDone, onError, { isReasoningModel: response.isReasoningModel });
              } else {
                onError(new Error(`Streaming not implemented for provider: ${response.provider}`));
              }

            } else {
              // --- Simulate Streaming for Non-Streaming Response ---
              const finalContent = response.content || '[Error: No content received.]';
              parser = createStreamingArtifactParser({ initialArtifactId: initialArtifactIdForParser });
              let currentArtifactNodeId = initialArtifactIdForParser;

              const actions = parser.processChunk(finalContent);
              const finalActions = parser.flush();
              const allActions = [...actions, ...finalActions];

              allActions.forEach(action => {
                currentArtifactNodeId = get()._processParserAction(conversationId, targetAssistantNodeId, action, currentArtifactNodeId);
              });

              // Handle reasoning summaries for non-streaming responses
              if (response.reasoningSummary && response.isReasoningModel) {
                get()._setReasoningInProgress(conversationId, targetAssistantNodeId, true); // Simulate start
                get()._appendReasoningSummary(conversationId, targetAssistantNodeId, response.reasoningSummary);
                get()._finalizeReasoningSummary(conversationId, targetAssistantNodeId);
              }

              const isNowIncomplete = parser.isIncomplete(); // Call method
              const incompleteId = parser.getIncompleteArtifactId(); // Call method
              get()._finalizeMessageNode(conversationId, targetAssistantNodeId, isNowIncomplete, incompleteId);

              if (previousIncompleteNodeId && !isNowIncomplete) {
                console.log(`[Non-Stream] Continuation successful, marking previous message ${previousIncompleteNodeId} as complete.`);
                get()._finalizeMessageNode(conversationId, previousIncompleteNodeId, false, null); // Use the ID directly
              }
              set(draft => { draft.isLoading = false; });
            }
          } catch (error) {
            console.error('[_handleApiResponse] Outer error processing response:', error);
            const errorMsg = `Error processing response: ${error.message}`;
            try {
              get()._updateMessageNodeContent(conversationId, targetAssistantNodeId, `\n\n[${errorMsg}]`);
              get()._finalizeMessageNode(conversationId, targetAssistantNodeId, false, null);
            } catch (finalizeError) { console.error("Failed to finalize message node after outer error:", finalizeError); }
            if (previousIncompleteNodeId) {
              try {
                const prevNode = get().conversations[conversationId]?.message_nodes[previousIncompleteNodeId]; // Use the ID directly
                if (prevNode && prevNode.isIncomplete) {
                  console.warn(`[_handleApiResponse Error] Marking previous incomplete message ${previousIncompleteNodeId} as complete due to continuation error.`);
                  get()._finalizeMessageNode(conversationId, previousIncompleteNodeId, false, null); // Use the ID directly
                }
              } catch (prevFinalizeError) { console.error("Failed to finalize previous message node after outer error:", prevFinalizeError); }
            }
            set(draft => { draft.error = errorMsg; draft.isLoading = false; });
          }
        },

        // == Selectors / Getters ==
        getConversation: (conversationId) => {
          return get().conversations[conversationId];
        },
        getActiveConversation: () => {
          const activeId = get().activeConversationId;
          return activeId ? get().conversations[activeId] : null;
        },
        _getActiveMessageChain: (conversationId) => {
          const conv = get().conversations[conversationId];
          if (!conv || !conv.firstMessageNodeId) return [];
          const chain = [];
          let currentNodeId = conv.firstMessageNodeId;
          while (currentNodeId) {
            const node = conv.message_nodes[currentNodeId];
            if (!node) break; // Should not happen in consistent state
            chain.push(node);
            currentNodeId = node.nextMessageId;
          }
          return chain;
        },
        getMessageChain: (conversationId) => {
          // Public selector just calls the internal helper for now
          return get()._getActiveMessageChain(conversationId);
        },
        getArtifactNode: (conversationId, nodeId) => {
          return get().conversations[conversationId]?.artifact_nodes[nodeId];
        },
        // Helper to get all versions of an artifact given any node ID in its chain
        _getArtifactChainNodes: (conversationId, nodeId) => {
          const conv = get().conversations[conversationId];
          let node = conv?.artifact_nodes[nodeId];
          if (!node) return [];

          // Find the start node
          let startNode = node;
          while (startNode.prevArtifactId) {
            const prevNode = conv.artifact_nodes[startNode.prevArtifactId];
            if (!prevNode) break; // Should not happen
            startNode = prevNode;
          }

          // Traverse forward from start
          const chain = [];
          let currentNode = startNode;
          while (currentNode) {
            chain.push(currentNode);
            if (!currentNode.nextArtifactId) break;
            currentNode = conv.artifact_nodes[currentNode.nextArtifactId];
            if (!currentNode) break; // Should not happen
          }
          return chain;
        },
        getArtifactChain: (conversationId, nodeId) => {
          // Public selector calls internal helper
          return get()._getArtifactChainNodes(conversationId, nodeId);
        },

        /**
         * Finds the latest version of each artifact relative to the active message chain.
         * @param {string} conversationId
         * @returns {Array<object>} An array of the latest artifact node objects for the active chain.
         */
        _getLatestArtifactNodesForActiveChain: (conversationId) => {
          const conv = get().conversations[conversationId];
          if (!conv) return [];

          const activeMessageChain = get()._getActiveMessageChain(conversationId);
          if (activeMessageChain.length === 0) return [];

          const referencedNodeIds = new Set();
          activeMessageChain.forEach(msgNode => {
            msgNode.artifactsCreated?.forEach(artNodeId => {
              referencedNodeIds.add(artNodeId);
            });
          });

          const latestNodePerChain = {}; // Map: startNodeId -> latestNodeIdInChain

          referencedNodeIds.forEach(nodeId => {
            let currentNode = conv.artifact_nodes[nodeId];
            if (!currentNode) return; // Skip if node somehow doesn't exist

            // Find the start node ID for this chain
            let startNodeId = currentNode.id;
            let tempNode = currentNode;
            // --- Cache for backward traversal ---
            const visited = new Set(); // Prevent infinite loops in corrupted data
            while (tempNode.prevArtifactId && !visited.has(tempNode.id)) {
              visited.add(tempNode.id);
              const prevNode = conv.artifact_nodes[tempNode.prevArtifactId];
              if (!prevNode) {
                console.warn(`Artifact chain broken: Cannot find prev node ${tempNode.prevArtifactId} from ${tempNode.id}`);
                break; // Chain is broken, use current node as effective start
              }
              startNodeId = prevNode.id;
              tempNode = prevNode;
            }

            // Store or update the latest known node ID for this chain's start ID
            latestNodePerChain[startNodeId] = nodeId;
          });

          // Collect the actual node objects corresponding to the latest IDs
          const latestNodes = Object.values(latestNodePerChain)
            .map(latestId => conv.artifact_nodes[latestId])
            .filter(Boolean); // Filter out any potential nulls if nodes were deleted

          return latestNodes;
        },

      }),
      {
        name: 'chatgpt-clone-chat-storage-v1', // New storage name
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          // Select state to persist
          conversations: state.conversations,
          activeConversationId: state.activeConversationId,
          // Do not persist isLoading or error
        }),
        version: 1, // Start at version 1
        migrate: async (persistedState, version) => {
          console.log(`Attempting migration from version ${version} to 1...`);
          // Example: If version 0 existed and needed migration to version 1
          // if (version === 0) {
          //   persistedState.someNewField = {};
          // }
          // Always return the (potentially migrated) state
          return persistedState;
        },
        onRehydrateStorage: (state) => {
          console.log("Hydration finished");
          // You can optionally return a function to handle hydration errors
          return (state, error) => {
            if (error) {
              console.error("An error occurred during hydration:", error);
              // Optionally clear storage or handle error
              // localStorage.removeItem('chatgpt-clone-chat-storage-v1');
            }
          }
        }
      }
    )
  )
);
