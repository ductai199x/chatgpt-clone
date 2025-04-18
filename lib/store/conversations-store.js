'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  createMessage,
  generateConversationTitle,
  findLastActiveMessageInfo,
  findPrecedingMessage,
  generateNewConversation,
  formatMessagesForProvider
} from '@/lib/utils/conversation';
import { generateId } from '@/lib/utils';
import { handleOpenAIStream, handleAnthropicStream, handleGoogleAIStream } from '../utils/streaming-handler';
import { createStreamingArtifactParser } from '../utils/streaming-artifact-parser';
import { useSettingsStore } from './settings-store';
import { useArtifactsStore } from './artifacts-store';

// Helper function to save conversations to localStorage
const saveConversationsToStorage = (conversations) => {
  if (typeof window !== 'undefined') {
    // Ensure we're saving a plain JS object, not an Immer draft proxy
    localStorage.setItem('ai-conversations', JSON.stringify(conversations));
  }
};

// Helper to get artifact store actions without calling hooks directly in callbacks
const getArtifactActions = () => ({
  startArtifact: useArtifactsStore.getState()._startArtifact,
  appendArtifactContent: useArtifactsStore.getState()._appendArtifactContent,
  completeArtifact: useArtifactsStore.getState()._completeArtifact,
});

export const useConversationsStore = create(immer((set, get) => ({
  // --- State ---
  conversations: {},
  activeConversationId: null,
  isLoading: false,
  error: null,

  // --- Basic Actions ---

  /**
   * Adds a new conversation object to the store and makes it active.
   * @param {object} conversation - The conversation object to add.
   */
  addConversation: (conversation) => {
    set((draft) => {
      draft.conversations[conversation.id] = conversation;
      draft.activeConversationId = conversation.id;
    });
    saveConversationsToStorage(get().conversations);
  },

  /**
   * Sets the currently active conversation ID.
   * @param {string | null} conversationId - The ID of the conversation to activate, or null.
   */
  setActiveConversation: (conversationId) => {
    set((draft) => {
      draft.activeConversationId = conversationId;
    });
    // Saving to storage is not strictly needed here as only the active ID changed.
  },

  /**
   * Updates top-level properties of a specific conversation (e.g., title).
   * Always updates the `updatedAt` timestamp.
   * @param {string} conversationId - The ID of the conversation to update.
   * @param {object} updates - An object containing properties to update.
   */
  updateConversation: (conversationId, updates) => {
    set((draft) => {
      const conversation = draft.conversations[conversationId];
      if (!conversation) return;

      Object.assign(conversation, updates);
      conversation.updatedAt = new Date().toISOString();
    });
    saveConversationsToStorage(get().conversations);
  },

  /**
   * Deletes a conversation from the store.
   * If the deleted conversation was active, activates the most recently updated remaining one.
   * @param {string} conversationId - The ID of the conversation to delete.
   */
  deleteConversation: (conversationId) => {
    try {
      useArtifactsStore.getState()._removeConversationArtifacts(conversationId);
    } catch (error) {
      console.error(`Failed to remove artifacts for conversation ${conversationId}:`, error);
    }

    set((draft) => {
      if (!draft.conversations[conversationId]) return;

      const wasActive = draft.activeConversationId === conversationId;
      delete draft.conversations[conversationId];

      if (wasActive) {
        const remainingIds = Object.keys(draft.conversations);
        if (remainingIds.length > 0) {
          remainingIds.sort((a, b) =>
            new Date(draft.conversations[b].updatedAt) - new Date(draft.conversations[a].updatedAt)
          );
          draft.activeConversationId = remainingIds[0];
        } else {
          draft.activeConversationId = null;
        }
      }
    });
    saveConversationsToStorage(get().conversations);
  },

  // --- Message Manipulation Actions ---

  /**
   * Internal helper to add a message node and link it to the previous active message.
   * Handles setting the first message ID and potential title generation.
   * @param {string} conversationId - The ID of the conversation.
   * @param {object} messageNode - The message node object to add.
   * @private Internal use by sendMessage/regenerateResponse.
   */
  _addMessageNode: (conversationId, messageNode) => {
    // Get info based on current state *before* mutation, as utils expect plain objects
    const currentConversation = get().conversations[conversationId];
    if (!currentConversation) {
      console.warn(`[_addMessageNode] Conversation ${conversationId} not found.`);
      return;
    }
    const { lastMessageId, lastVersionId } = findLastActiveMessageInfo(currentConversation);
    const settings = useSettingsStore.getState();
    const isFirstUserMessage = settings.interface.autoTitleConversations &&
                               currentConversation.title === 'New chat' &&
                               messageNode.role === 'user' &&
                               !lastMessageId;

    set((draft) => {
      const conversation = draft.conversations[conversationId];
      if (!conversation) return; // Re-check existence inside draft

      conversation.messages[messageNode.id] = messageNode;

      // Link the previous message version
      if (lastMessageId && lastVersionId) {
        const lastNode = conversation.messages[lastMessageId];
        const lastVersion = lastNode?.versions?.find(v => v.id === lastVersionId);
        if (lastVersion) {
          lastVersion.nextMessageId = messageNode.id;
          lastVersion.nextMessageVersionId = messageNode.activeVersionId;
        } else {
          console.warn(`[_addMessageNode] Last active version ${lastVersionId} not found in node ${lastMessageId}.`);
        }
      } else {
        // This is the very first message node
        conversation.firstMessageId = messageNode.id;
      }

      // Auto-generate title if applicable
      if (isFirstUserMessage) {
        // generateConversationTitle needs the updated structure.
        // Pass the draft conversation object (assuming it handles Immer proxies).
        conversation.title = generateConversationTitle(conversation);
      }

      conversation.updatedAt = new Date().toISOString();
      // Note: Saving is deferred to the caller (sendMessage/regenerateResponse).
    });
  },

  /**
   * Processes actions generated by the streaming artifact parser and updates state.
   * @param {string} conversationId - The conversation ID.
   * @param {string} messageId - The message node ID.
   * @param {string} versionId - The specific version ID being updated.
   * @param {Array<object>} actions - Array of action objects from the parser.
   * @private Internal use by streaming handlers.
   */
  _processParserActions: (conversationId, messageId, versionId, actions) => {
    if (!actions || actions.length === 0) return;

    const artifactActions = getArtifactActions(); // Get actions outside `set`

    set((draft) => {
      const conversation = draft.conversations[conversationId];
      const messageNode = conversation?.messages?.[messageId];
      const version = messageNode?.versions?.find(v => v.id === versionId);

      if (!version) {
        console.warn(`[_processParserActions] Version not found: ${versionId} in Msg ${messageId}`);
        return;
      }

      actions.forEach(action => {
        switch (action.type) {
          case 'text':
            version.content += action.content;
            break;
          case 'artifact_start':
            // Call artifact store action
            artifactActions.startArtifact(action.id, action.metadata, conversationId);
            // Append a placeholder/marker to the message content for rendering
            // NOTE: This placeholder is for the *rendering* step later.
            // It tells the Markdown renderer to insert the artifact component.
            // NOTE: Use lowercase tag name for react-markdown
            version.content += `<artifactrenderer id="${action.id}"></artifactrenderer>`; // Use lowercase and add closing tag
            break;
          case 'artifact_content':
            // Call artifact store action - DO NOT append to message content here
            artifactActions.appendArtifactContent(action.id, action.content, conversationId);
            break;
          case 'artifact_end':
            // Call artifact store action - DO NOT modify message content here
            artifactActions.completeArtifact(action.id, conversationId);
            break;
          default:
            console.warn(`Unknown parser action type: ${action.type}`);
        }
      });
    });
  },

  /**
   * Updates the final state of a message version after streaming is complete.
   * Sets isIncomplete and incompleteArtifactId flags.
   * @param {string} conversationId
   * @param {string} messageId
   * @param {string} versionId
   * @param {boolean} isIncomplete
   * @param {string | null} incompleteArtifactId
   * @private
   */
  _finalizeMessageVersionState: (conversationId, messageId, versionId, isIncomplete, incompleteArtifactId) => {
      set(draft => {
          const version = draft.conversations[conversationId]?.messages?.[messageId]?.versions?.find(v => v.id === versionId);
          if (version) {
              version.isIncomplete = isIncomplete;
              version.incompleteArtifactId = incompleteArtifactId;
          }
      });
  },

  /**
   * Updates the content of a specific version of a message. Used during streaming.
   * Does not update the conversation's `updatedAt` timestamp.
   * @param {string} conversationId - The conversation ID.
   * @param {string} messageId - The message node ID.
   * @param {string} versionId - The specific version ID to update.
   * @param {string | object[]} newContent - The new content for the version.
   */
  updateMessageVersionContent: (conversationId, messageId, versionId, newContent) => {
    set((draft) => {
      const conversation = draft.conversations[conversationId];
      const messageNode = conversation?.messages?.[messageId];
      const version = messageNode?.versions?.find(v => v.id === versionId);

      if (!version) {
        // console.warn(`[updateMessageVersionContent] Version not found: ${versionId} in Msg ${messageId}`);
        return;
      }
      version.content = newContent;
    });
    // Note: localStorage saving is deferred to the end of the streaming process (onDone/onError).
  },

  /**
   * Internal reusable handler for processing API responses (streaming or non-streaming).
   * Uses the streaming artifact parser and updates conversation/artifact state.
   * @private
   */
  _handleApiResponse: async (
    conversationId,
    targetAssistantId,
    targetVersionId,
    response, // { stream?: ReadableStream, content?: string, provider: string }
    initialArtifactIdForParser = null,
    previousAssistantVersionInfo = null // { messageId, versionId } | null
  ) => {
    let parser = null;

    try {
      if (response.stream) {
        // --- Handle Streaming Response ---
        parser = createStreamingArtifactParser({ initialArtifactId: initialArtifactIdForParser });

        const onChunk = (chunk) => {
          const actions = parser.processChunk(chunk);
          get()._processParserActions(conversationId, targetAssistantId, targetVersionId, actions);
        };

        const onDone = () => {
          const finalActions = parser.flush();
          get()._processParserActions(conversationId, targetAssistantId, targetVersionId, finalActions);

          const isNowIncomplete = parser.isIncomplete();
          const incompleteId = parser.getIncompleteArtifactId();
          get()._finalizeMessageVersionState(conversationId, targetAssistantId, targetVersionId, isNowIncomplete, incompleteId);

          if (previousAssistantVersionInfo && !isNowIncomplete) {
            get()._finalizeMessageVersionState(
              conversationId,
              previousAssistantVersionInfo.messageId,
              previousAssistantVersionInfo.versionId,
              false, null
            );
          }

          set(draft => {
            const conv = draft.conversations[conversationId];
            if (conv) conv.updatedAt = new Date().toISOString();
            draft.isLoading = false; // Mark loading complete here
          });
          saveConversationsToStorage(get().conversations);
        };

        const onError = (error) => {
          console.error(`[${response.provider}] Streaming error:`, error);
          const errorContent = 'I apologize, but an error occurred during streaming.';
          set(draft => {
            const version = draft.conversations[conversationId]?.messages?.[targetAssistantId]?.versions?.find(v => v.id === targetVersionId);
            if (version) {
              version.content = errorContent;
              version.isIncomplete = false;
              version.incompleteArtifactId = null;
            }
            if (draft.conversations[conversationId]) {
              draft.conversations[conversationId].updatedAt = new Date().toISOString();
            }
            draft.error = `Error during ${response.provider} streaming: ${error.message}`;
            draft.isLoading = false; // Mark loading complete on error
          });
          saveConversationsToStorage(get().conversations);
        };

        const streamHandlers = {
          openai: handleOpenAIStream,
          anthropic: handleAnthropicStream,
          google: handleGoogleAIStream,
        };
        const handler = streamHandlers[response.provider];
        if (handler) {
          await handler(response.stream, onChunk, onDone, onError);
        } else {
          onError(new Error(`Streaming not implemented for provider: ${response.provider}`));
        }

      } else {
        // --- Simulate Streaming for Non-Streaming Response ---
        const finalContent = response.content || 'Error: No content received.';
        parser = createStreamingArtifactParser({ initialArtifactId: initialArtifactIdForParser });

        // Process the entire content in one go
        const actions = parser.processChunk(finalContent);
        const finalActions = parser.flush();
        const allActions = [...actions, ...finalActions];

        get()._processParserActions(conversationId, targetAssistantId, targetVersionId, allActions);

        const isNowIncomplete = parser.isIncomplete();
        const incompleteId = parser.getIncompleteArtifactId();
        get()._finalizeMessageVersionState(conversationId, targetAssistantId, targetVersionId, isNowIncomplete, incompleteId);

        if (previousAssistantVersionInfo && !isNowIncomplete) {
          get()._finalizeMessageVersionState(
            conversationId,
            previousAssistantVersionInfo.messageId,
            previousAssistantVersionInfo.versionId,
            false, null
          );
        }

        set(draft => {
          const conv = draft.conversations[conversationId];
          if (conv) conv.updatedAt = new Date().toISOString();
          draft.isLoading = false; // Mark loading complete
        });
        saveConversationsToStorage(get().conversations);
      }
    } catch (error) {
      // Catch errors specifically within the response handling/parsing phase
      console.error('[_handleApiResponse] Error processing response:', error);
      const errorMsg = `Error processing response: ${error.message}`;
      set(draft => {
        const version = draft.conversations[conversationId]?.messages?.[targetAssistantId]?.versions?.find(v => v.id === targetVersionId);
        if (version) {
          version.content = errorMsg;
          version.isIncomplete = false;
          version.incompleteArtifactId = null;
        }
        if (draft.conversations[conversationId]) {
          draft.conversations[conversationId].updatedAt = new Date().toISOString();
        }
        draft.error = errorMsg;
        draft.isLoading = false; // Mark loading complete on error
      });
      saveConversationsToStorage(get().conversations);
    }
  },

  /**
   * Sends a user message, gets a streaming response from the API, and updates the conversation.
   * @param {string} conversationId - The conversation ID.
   * @param {string | object[]} content - The user message content.
   * @param {object[]} [images=[]] - Optional images for multimodal input.
   */
  sendMessage: async (conversationId, content, images = []) => {
    const initialConversation = get().conversations[conversationId];
    if (!initialConversation) {
      console.error(`[sendMessage] Conversation ${conversationId} not found.`);
      return;
    }

    const settings = useSettingsStore.getState();
    const { currentProvider, currentModel, providers, systemPrompt, temperature, maxTokens } = settings;
    const apiKey = providers[currentProvider]?.apiKey;

    if (!apiKey) {
      set(draft => {
        draft.error = 'API key is not set. Please add your API key in Settings.';
        draft.isLoading = false;
      });
      return;
    }

    let userMessageNode = null;
    let assistantMessageNode = null;
    let assistantVersionId = null;
    let parser = null;

    let initialArtifactIdForParser = null;
    let previousAssistantVersionInfo = null;

    const { lastMessageId, lastVersionId } = findLastActiveMessageInfo(initialConversation);
    const lastMessageNode = initialConversation.messages[lastMessageId];
    if (lastMessageNode?.role === 'user' && typeof content === 'string' && content.trim().toLowerCase() === 'continue') {
      const { precedingMessageId: prevAssistantMsgId, precedingVersionId: prevAssistantVersionId } = findPrecedingMessage(initialConversation, lastMessageId);
        const prevAssistantNode = initialConversation.messages[prevAssistantMsgId];
        const prevAssistantVersion = prevAssistantNode?.versions?.find(v => v.id === prevAssistantVersionId);

        if (prevAssistantVersion?.isIncomplete && prevAssistantVersion.incompleteArtifactId) {
            initialArtifactIdForParser = prevAssistantVersion.incompleteArtifactId;
            previousAssistantVersionInfo = { // Store details to mark complete later
                messageId: prevAssistantMsgId,
                versionId: prevAssistantVersionId
            };
            console.log(`[sendMessage] Continuing incomplete artifact: ${initialArtifactIdForParser}`);
        }
    }

    try {
      set(draft => {
        draft.isLoading = true;
        draft.error = null;
      });

      // 1. Add User Message
      userMessageNode = createMessage({ role: 'user', content, images });
      get()._addMessageNode(conversationId, userMessageNode);

      // 2. Add Assistant Placeholder
      assistantMessageNode = createMessage({ role: 'assistant', content: '' });
      assistantVersionId = assistantMessageNode.activeVersionId;
      get()._addMessageNode(conversationId, assistantMessageNode);

      // --- Get conversation state *after* adding both nodes ---
      const conversationForApi = get().conversations[conversationId];
      if (!conversationForApi) throw new Error("Conversation disappeared after adding messages.");

      // 3. Prepare API Call
      const { createApiService } = await import('@/lib/api/api-service');
      const apiService = createApiService(currentProvider, apiKey);
      const messagesForApi = formatMessagesForProvider(conversationForApi, currentProvider, systemPrompt);

      if (initialArtifactIdForParser && messagesForApi.length > 0) {
        // Modify the last user message or add a system prompt instruction
        // Example: Prepend to the last user message content
        const lastUserMsgIndex = messagesForApi.length -1; // Assuming user message is last
        if (messagesForApi[lastUserMsgIndex].role === 'user') {
            messagesForApi[lastUserMsgIndex].content = `Please continue exactly where you left off, completing the previous artifact.\n\n${messagesForApi[lastUserMsgIndex].content}`;
        } else {
            // Fallback: Add a new user message (less ideal) or system message
            console.warn("Could not easily add continuation instruction.");
        }
    }

      // 4. Make API Call
      const response = await apiService.chatCompletion(messagesForApi, currentModel, {
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 8192,
        stream: true,
      });

      // 5. Handle Response
      await get()._handleApiResponse(
        conversationId,
        assistantMessageNode.id,
        assistantVersionId,
        response,
        initialArtifactIdForParser,
        previousAssistantVersionInfo
      );
    } catch (error) {
      console.error('[sendMessage] Outer error:', error);
      const errorMsg = error.message || 'An error occurred while sending the message.';
      set(draft => {
        draft.error = errorMsg;
        draft.isLoading = false;
      });

      // Update placeholder with error if it was created
      if (assistantMessageNode && assistantVersionId) {
        get().updateMessageVersionContent(conversationId, assistantMessageNode.id, assistantVersionId, `Error: ${errorMsg}`);
        set(draft => {
          if (draft.conversations[conversationId]) {
            draft.conversations[conversationId].updatedAt = new Date().toISOString();
          }
        });
        saveConversationsToStorage(get().conversations);
      } else {
        // Ensure storage is saved if only user node was added before error
        saveConversationsToStorage(get().conversations);
      }
    }
  },

  /**
   * Deletes a message node and terminates the active branch at that point
   * by setting the predecessor's forward pointers to null.
   * @param {string} conversationId - The conversation ID.
   * @param {string} messageIdToDelete - The ID of the message node to delete.
   */
  deleteMessage: (conversationId, messageIdToDelete) => {
    // Get predecessor info *before* mutation
    const currentConversation = get().conversations[conversationId];
    if (!currentConversation?.messages?.[messageIdToDelete]) {
      console.warn(`[deleteMessage] Conversation or message ${messageIdToDelete} not found.`);
      return;
    }
    const { precedingMessageId, precedingVersionId } = findPrecedingMessage(currentConversation, messageIdToDelete);
    const isFirstMessage = currentConversation.firstMessageId === messageIdToDelete;

    set((draft) => {
      const conversation = draft.conversations[conversationId];
      if (!conversation?.messages?.[messageIdToDelete]) return; // Re-check in draft

      // Remove the target message node
      delete conversation.messages[messageIdToDelete];

      // Update the Predecessor to terminate the branch
      if (precedingMessageId && precedingVersionId) {
        const prevNode = conversation.messages[precedingMessageId];
        const prevVersion = prevNode?.versions?.find(v => v.id === precedingVersionId);
        if (prevVersion) {
          prevVersion.nextMessageId = null;
          prevVersion.nextMessageVersionId = null;
        } else {
          console.warn(`[deleteMessage] Preceding version ${precedingVersionId} not found in node ${precedingMessageId} during update.`);
        }
      } else if (isFirstMessage) {
        // We deleted the very first message
        conversation.firstMessageId = null;
      }

      // Note: Nodes after the deleted one in this specific branch are now effectively orphaned.
      conversation.updatedAt = new Date().toISOString();
    });
    saveConversationsToStorage(get().conversations);
  },

  /**
   * Regenerates the response for an assistant message. Creates a new version,
   * makes it active, and updates pointers to create a new branch end.
   * @param {string} conversationId - The conversation ID.
   * @param {string} messageIdToRegenerate - The ID of the assistant message node to regenerate.
   */
  regenerateResponse: async (conversationId, messageIdToRegenerate) => {
    const initialConversation = get().conversations[conversationId];
    const messageNodeToRegenerate = initialConversation?.messages?.[messageIdToRegenerate];

    if (!messageNodeToRegenerate) {
      console.warn("[regenerateResponse] Conversation or message node not found.");
      return;
    }
    if (messageNodeToRegenerate.role !== 'assistant') {
      console.warn("[regenerateResponse] Cannot regenerate a non-assistant message.");
      return;
    }

    // --- Check for Continuation Scenario (based on message *before* the one being regenerated) ---
    const { precedingMessageId, precedingVersionId } = findPrecedingMessage(initialConversation, messageIdToRegenerate);
    let initialArtifactIdForParser = null;
    let previousAssistantVersionInfo = null; // This refers to the message *before* the one being regenerated
    const precedingUserNode = initialConversation.messages[precedingMessageId];
    // Check if the user message *before* the assistant message being regenerated was 'continue'
    if (precedingUserNode?.role === 'user' && typeof precedingUserNode.versions?.[0]?.content === 'string' && precedingUserNode.versions[0].content.trim().toLowerCase() === 'continue') {
        // Now check the assistant message *before that user message*
        const { precedingMessageId: prevAssistantMsgId, precedingVersionId: prevAssistantVersionId } = findPrecedingMessage(initialConversation, precedingMessageId);
        const prevAssistantNode = initialConversation.messages[prevAssistantMsgId];
        const prevAssistantVersion = prevAssistantNode?.versions?.find(v => v.id === prevAssistantVersionId);
        if (prevAssistantVersion?.isIncomplete && prevAssistantVersion.incompleteArtifactId) {
            initialArtifactIdForParser = prevAssistantVersion.incompleteArtifactId;
            previousAssistantVersionInfo = { messageId: prevAssistantMsgId, versionId: prevAssistantVersionId };
            console.log(`[regenerateResponse] Continuing incomplete artifact: ${initialArtifactIdForParser}`);
        }
    }
    // --- End Continuation Check ---

    const settings = useSettingsStore.getState();
    const { currentProvider, currentModel, providers, systemPrompt, temperature, maxTokens } = settings;
    const apiKey = providers[currentProvider]?.apiKey;
    if (!apiKey) {
      set(draft => {
        draft.error = 'API key is not set for regeneration.';
        draft.isLoading = false;
      });
      return;
    }

    set(draft => {
      draft.isLoading = true;
      draft.error = null;
    });

    let newVersionId = null; // To store the ID of the new version

    try {
      // Format messages up to the point before the message being regenerated
      const messagesForApi = formatMessagesForProvider(
        initialConversation, currentProvider, systemPrompt,
        precedingMessageId, precedingVersionId
      );

      const { createApiService } = await import('@/lib/api/api-service');
      const apiService = createApiService(currentProvider, apiKey);

      if (initialArtifactIdForParser && messagesForApi.length > 0) {
        // Add instruction (similar logic as in sendMessage)
        const lastMsgIndex = messagesForApi.length - 1;
        if (messagesForApi[lastMsgIndex].role === 'user') { // Should be the user message before the assistant
          messagesForApi[lastMsgIndex].content = `Please continue exactly where you left off, completing the previous artifact.\n\n${messagesForApi[lastMsgIndex].content}`;
        } else { console.warn("[regenerateResponse] Could not easily add continuation instruction."); }
      }

      // Create placeholder version, set active, update predecessor pointer
      set((draft) => {
        const conv = draft.conversations[conversationId];
        const node = conv?.messages?.[messageIdToRegenerate];
        if (!node?.versions) {
          console.warn(`[regenerateResponse:set] Conv/Msg/Versions disappeared.`);
          draft.isLoading = false; // Abort loading state
          return;
        }

        const tempNewVersionId = generateId();
        newVersionId = tempNewVersionId; // Capture ID for use outside set

        const newVersion = {
          id: tempNewVersionId, 
          content: "", 
          createdAt: new Date().toISOString(),
          nextMessageId: null, 
          nextMessageVersionId: null,
          isIncomplete: false,
          incompleteArtifactId: null,
        };
        node.versions.push(newVersion);
        node.activeVersionId = tempNewVersionId;

        // Update Predecessor Pointer
        if (precedingMessageId && precedingVersionId) {
          const precedingNode = conv.messages[precedingMessageId];
          const precedingVersion = precedingNode?.versions?.find(v => v.id === precedingVersionId);
          if (precedingVersion) {
            precedingVersion.nextMessageVersionId = tempNewVersionId; // Point to the new version
          }
        }
        conv.updatedAt = new Date().toISOString();
      });

      const targetVersionId = newVersionId; // Use the captured ID
      if (!targetVersionId) {
        throw new Error("Failed to create placeholder version (state update aborted?).");
      }

      // Make API Call
      const response = await apiService.chatCompletion(messagesForApi, currentModel, {
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 8192,
        stream: true,
      });

      // Handle Response
      await get()._handleApiResponse(
        conversationId,
        messageIdToRegenerate, // The ID of the node being regenerated
        newVersionId,          // The ID of the newly created version
        response,
        initialArtifactIdForParser, // Determined based on message *before* regenerated one
        previousAssistantVersionInfo // Determined based on message *before* regenerated one
      );
    } catch (error) {
      console.error('[regenerateResponse] Outer error:', error);
      const errorMsg = error.message || 'An error occurred during regeneration.';
      set(draft => {
        draft.error = errorMsg;
        draft.isLoading = false;
      });

      // Attempt to update placeholder with error if it was created
      const capturedVersionId = newVersionId;
      if (capturedVersionId) {
         set(draft => {
            const version = draft.conversations[conversationId]?.messages?.[messageIdToRegenerate]?.versions?.find(v => v.id === capturedVersionId);
            if (version) {
                version.content = `Error: ${errorMsg}`;
                version.isIncomplete = false;
                version.incompleteArtifactId = null;
            }
            if (draft.conversations[conversationId]) {
                draft.conversations[conversationId].updatedAt = new Date().toISOString();
            }
        });
        saveConversationsToStorage(get().conversations);
      } else {
        saveConversationsToStorage(get().conversations);
      }
    }
  },

  /**
   * Switches the active version for a given message node and updates the predecessor's pointer
   * to ensure the active chain reflects the change.
   * @param {string} conversationId - The conversation ID.
   * @param {string} messageId - The ID of the message node to switch.
   * @param {string} newVersionId - The ID of the version to make active.
   */
  switchActiveMessageVersion: (conversationId, messageId, newVersionId) => {
    const currentConversation = get().conversations[conversationId];
    const messageNodeToSwitch = currentConversation?.messages?.[messageId];
    if (!messageNodeToSwitch?.versions) {
      console.warn(`[switchActiveMessageVersion] Invalid path: ${conversationId}, ${messageId}`);
      return;
    }
    const versionExists = messageNodeToSwitch.versions.some(v => v.id === newVersionId);
    if (!versionExists || messageNodeToSwitch.activeVersionId === newVersionId) {
      return; // Ignore if version invalid or already active
    }
    const { precedingMessageId, precedingVersionId } = findPrecedingMessage(currentConversation, messageId);

    set((draft) => {
      const conversation = draft.conversations[conversationId];
      const nodeToSwitch = conversation?.messages?.[messageId];
      if (!nodeToSwitch) return; // Re-check in draft

      // Update Preceding Message's Pointer
      if (precedingMessageId && precedingVersionId) {
        const precedingNode = conversation.messages[precedingMessageId];
        const precedingVersion = precedingNode?.versions?.find(v => v.id === precedingVersionId);
        if (precedingVersion) {
          precedingVersion.nextMessageVersionId = newVersionId; // Point to the newly active version
        }
      }

      // Update the Target Message's Active Version
      nodeToSwitch.activeVersionId = newVersionId;

      conversation.updatedAt = new Date().toISOString();
    });
    saveConversationsToStorage(get().conversations);
  },

  // --- Initialization and Utility Actions ---

  /**
   * Loads conversations from localStorage on client-side initialization.
   * Creates a new conversation if none exist. Activates the most recently updated one.
   */
  loadConversations: () => {
    if (typeof window === 'undefined') return;

    let loadedConversations = {};
    try {
      const savedData = localStorage.getItem('ai-conversations');
      if (savedData) {
        loadedConversations = JSON.parse(savedData);
        // --- Migration Logic ---
        for (const convId in loadedConversations) {
          const conversation = loadedConversations[convId];
          if (conversation && conversation.messages) {
            for (const msgId in conversation.messages) {
              const message = conversation.messages[msgId];
              if (message && message.versions && Array.isArray(message.versions)) {
                message.versions.forEach(version => {
                  if (version) {
                    // Add isIncomplete if missing, default to false
                    if (version.isIncomplete === undefined) {
                      version.isIncomplete = false;
                    }
                    // Add incompleteArtifactId if missing, default to null
                    if (version.incompleteArtifactId === undefined) {
                      version.incompleteArtifactId = null;
                    }
                  }
                });
              }
            }
          }
        }
        // --- End Migration Logic ---
      }
    } catch (error) {
      console.error('Failed to load or parse conversations from localStorage:', error);
      localStorage.removeItem('ai-conversations'); // Clear potentially corrupted data
    }

    if (Object.keys(loadedConversations).length === 0) {
      const newConversation = generateNewConversation();
      loadedConversations[newConversation.id] = newConversation;
      saveConversationsToStorage(loadedConversations);
      set(draft => {
        draft.conversations = loadedConversations;
        draft.activeConversationId = newConversation.id;
      });
    } else {
      const currentActiveId = get().activeConversationId;
      let newActiveId = currentActiveId;
      // Select most recent if current active is invalid or missing
      if (!currentActiveId || !loadedConversations[currentActiveId]) {
        const conversationIds = Object.keys(loadedConversations);
        conversationIds.sort((a, b) =>
          new Date(loadedConversations[b].updatedAt) - new Date(loadedConversations[a].updatedAt)
        );
        newActiveId = conversationIds.length > 0 ? conversationIds[0] : null;
      }
      set(draft => {
        draft.conversations = loadedConversations;
        draft.activeConversationId = newActiveId;
      });
    }
  },

  /**
   * Clears all conversations and creates a single new, active conversation.
   */
  clearAllConversations: () => {
    const allConvIds = Object.keys(get().conversations);
    try {
      const removeArtifactsAction = useArtifactsStore.getState()._removeConversationArtifacts;
      allConvIds.forEach(id => removeArtifactsAction(id));
    } catch (error) {
      console.error(`Failed to remove artifacts during clearAll:`, error);
    }

    const newConversation = generateNewConversation();
    const newState = { [newConversation.id]: newConversation };
    set(draft => {
      draft.conversations = newState;
      draft.activeConversationId = newConversation.id;
      draft.isLoading = false;
      draft.error = null;
    });
    saveConversationsToStorage(newState);
  },

  /**
   * Exports a specific conversation as a JSON object (deep copy).
   * @param {string} conversationId - The ID of the conversation to export.
   * @returns {object | null} A deep copy of the conversation object with an added `exportedAt` timestamp, or null if not found.
   */
  exportConversation: (conversationId) => {
    const conversation = get().conversations[conversationId];
    if (!conversation) return null;
    try {
      const getArtifacts = useArtifactsStore.getState().getArtifactsForConversation;
      const artifactsToExport = getArtifacts(conversationId);
      // Use JSON methods for a simple deep clone of plain object structure
      const exportData = JSON.parse(JSON.stringify({
        ...conversation,
        artifacts: artifactsToExport, // Add artifacts map
        exportedAt: new Date().toISOString(),
      }));
      return exportData;
    } catch (error) {
      console.error("Failed to deep clone conversation for export:", error);
      return null;
    }
  },

  /**
   * Imports a conversation object into the store, generating an ID if missing.
   * Sets the import time as the `updatedAt` time.
   * @param {object} conversationData - The conversation data to import. Should have a `messages` map.
   * @returns {string | null} The ID of the imported conversation or null on failure.
   */
  importConversation: (conversationData) => {
    try {
      if (!conversationData || typeof conversationData.messages !== 'object' || conversationData.messages === null) {
        throw new Error("Invalid conversation format: 'messages' map is missing or invalid.");
      }
      const newConversationId = importData.id && !get().conversations[importData.id]
        ? importData.id : generateId();

      const conversation = {
        ...importData,
        id: newConversationId,
        createdAt: importData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        firstMessageId: importData.firstMessageId || null,
        exportedAt: undefined,
        artifacts: undefined, // Remove artifacts from conversation object itself
      };
      // Ensure new fields exist on imported versions
      if (conversation.messages) {
        for (const msgId in conversation.messages) {
          const message = conversation.messages[msgId];
          if (message?.versions?.forEach) {
            message.versions.forEach(version => {
              if (version) {
                if (version.isIncomplete === undefined) version.isIncomplete = false;
                if (version.incompleteArtifactId === undefined) version.incompleteArtifactId = null;
              }
            });
          }
        }
      }

      // --- Import Artifacts ---
      if (importData.artifacts && typeof importData.artifacts === 'object') {
        const addArtifactAction = useArtifactsStore.getState()._startArtifact; // Use start? Or need a bulk add?
        const appendContentAction = useArtifactsStore.getState()._appendArtifactContent;
        const completeAction = useArtifactsStore.getState()._completeArtifact;

        for (const artifactId in importData.artifacts) {
          try {
            const artifactObject = importData.artifacts[artifactId];
            if (artifactObject && artifactObject.id) {
              // Re-create artifact state using store actions
              addArtifactAction(artifactObject.id, artifactObject.metadata, newConversationId);
              if (artifactObject.content) {
                  appendContentAction(artifactObject.id, artifactObject.content, newConversationId);
              }
              if (artifactObject.isComplete) {
                  completeAction(artifactObject.id, newConversationId);
              }
            }
          } catch (artifactError) {
            console.error(`Failed to import artifact ${artifactId}:`, artifactError);
          }
        }
      }
      // --- End Import Artifacts ---

      get().addConversation(conversation); // Use existing action to add and make active
      return conversation.id;
    } catch (error) {
      console.error('Failed to import conversation:', error);
      set(draft => {
        draft.error = 'Failed to import conversation: ' + error.message;
      });
      return null;
    }
  },

}))); // End create(immer(...))

// --- Initialize Store ---
// Load conversations from localStorage when the store is initialized on the client
if (typeof window !== 'undefined') {
  // This call happens *after* the store is created and wrapped by Immer.
  // The `set` calls inside loadConversations will be handled correctly.
  useConversationsStore.getState().loadConversations();
}