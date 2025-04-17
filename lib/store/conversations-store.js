'use client';

import { create } from 'zustand';
import { 
  createMessage, 
  generateConversationTitle, 
  getActiveMessageChain, // Keep if used elsewhere, otherwise potentially remove if only for debugging
  findLastActiveMessageInfo,
  findPrecedingMessage,
  generateNewConversation,
  formatMessagesForProvider
} from '@/lib/utils/conversation';
import { generateId } from '@/lib/utils';
import { handleOpenAIStream, handleAnthropicStream, handleGoogleAIStream } from '../utils/streaming-handler';
import { useSettingsStore } from './settings-store';

// Helper function to save conversations to localStorage
const saveConversationsToStorage = (conversations) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('ai-conversations', JSON.stringify(conversations));
  }
};

export const useConversationsStore = create((set, get) => ({
  // --- State ---
  conversations: {},
  activeConversationId: null,
  isLoading: false,
  error: null,
  
  // --- Basic Actions ---

  /**
   * Adds a new conversation object to the store.
   * @param {object} conversation - The conversation object to add.
   */
  addConversation: (conversation) => {
    set((state) => {
      const updatedConversations = {
        ...state.conversations,
        [conversation.id]: conversation,
      };
      saveConversationsToStorage(updatedConversations); // Save updated state
      return {
        conversations: updatedConversations,
        activeConversationId: conversation.id, // Make the new conversation active
      };
    });
  },
  
  /**
   * Sets the currently active conversation ID.
   * @param {string | null} conversationId - The ID of the conversation to activate, or null.
   */
  setActiveConversation: (conversationId) => {
    set({ activeConversationId: conversationId });
  },
  
  /**
   * Updates top-level properties of a specific conversation (e.g., title).
   * @param {string} conversationId - The ID of the conversation to update.
   * @param {object} updates - An object containing properties to update.
   */
  updateConversation: (conversationId, updates) => {
    set((state) => {
      const conversation = state.conversations[conversationId];
      if (!conversation) return state; // Ignore if conversation doesn't exist
      
      const updatedConversation = {
        ...conversation,
        ...updates,
        updatedAt: new Date().toISOString(), // Always update timestamp
      };
      
      const updatedConversations = {
        ...state.conversations,
        [conversationId]: updatedConversation,
      };
      saveConversationsToStorage(updatedConversations); // Save updated state
      return { conversations: updatedConversations };
    });
  },
  
  /**
   * Deletes a conversation from the store.
   * @param {string} conversationId - The ID of the conversation to delete.
   */
  deleteConversation: (conversationId) => {
    set((state) => {
      const conversations = { ...state.conversations };
      if (!conversations[conversationId]) return state; // Ignore if already deleted

      delete conversations[conversationId];
      
      let newActiveId = state.activeConversationId;
      // If the deleted conversation was active, select the most recently updated remaining one
      if (state.activeConversationId === conversationId) {
        const remainingIds = Object.keys(conversations);
        if (remainingIds.length > 0) {
           // Sort by 'updatedAt' descending to find the most recent
           remainingIds.sort((a, b) => 
             new Date(conversations[b].updatedAt) - new Date(conversations[a].updatedAt)
           );
           newActiveId = remainingIds[0];
        } else {
           newActiveId = null; // No conversations left
        }
      }
      
      saveConversationsToStorage(conversations); // Save updated state
      return {
        conversations,
        activeConversationId: newActiveId,
      };
    });
  },

  // --- Message Manipulation Actions ---

  /**
   * Internal helper to add a message node to a conversation and link it to the previous active message.
   * Handles setting the first message ID and potential title generation.
   * @param {string} conversationId - The ID of the conversation.
   * @param {object} messageNode - The message node object to add.
   * @private Internal use by sendMessage.
   */
  _addMessageNode: (conversationId, messageNode) => {
    set((state) => {
      const conversation = state.conversations[conversationId];
      if (!conversation) {
        console.warn(`[_addMessageNode] Conversation ${conversationId} not found.`);
        return state;
      }

      // Find the end of the current active chain to link from
      const { lastMessageId, lastVersionId } = findLastActiveMessageInfo(conversation);
      
      const updatedMessagesMap = {
        ...conversation.messages,
        [messageNode.id]: messageNode,
      };

      let updatedFirstMessageId = conversation.firstMessageId;

      // Link the previous message version to this new message node if applicable
      if (lastMessageId && lastVersionId) {
        const lastNode = updatedMessagesMap[lastMessageId];
        // Ensure lastNode and its versions exist before attempting update
        if (lastNode?.versions) { 
          const lastVersionIndex = lastNode.versions.findIndex(v => v.id === lastVersionId);
          if (lastVersionIndex !== -1) {
            // Create a new version object with updated pointers
            const updatedLastVersion = { 
              ...lastNode.versions[lastVersionIndex], 
              nextMessageId: messageNode.id,
              nextMessageVersionId: messageNode.activeVersionId // Link to the new node's active version
            };
            // Create a new versions array for the last node
            const updatedLastVersions = [
              ...lastNode.versions.slice(0, lastVersionIndex),
              updatedLastVersion,
              ...lastNode.versions.slice(lastVersionIndex + 1),
            ];
            // Create a new node object for the last node
            updatedMessagesMap[lastMessageId] = {
              ...lastNode,
              versions: updatedLastVersions,
            };
          } else {
             console.warn(`[_addMessageNode] Last active version ${lastVersionId} not found in node ${lastMessageId}.`);
          }
        } else {
           console.warn(`[_addMessageNode] Last message node ${lastMessageId} not found or has no versions.`);
        }
      } else {
        // This is the very first message node in the conversation
        updatedFirstMessageId = messageNode.id;
      }

      // --- Auto-generate title logic ---
      const settings = useSettingsStore.getState();
      let title = conversation.title;
      // Check conditions: auto-title enabled, title is default, it's a user message, and it's the first node added.
      if (settings.interface.autoTitleConversations && 
          title === 'New chat' && 
          messageNode.role === 'user' && 
          !lastMessageId) { // Check if it's the first node
        // Create a temporary conversation object reflecting the state *after* adding the node
        const tempUpdatedConv = { 
            ...conversation, 
            messages: updatedMessagesMap, 
            firstMessageId: updatedFirstMessageId 
        }; 
        title = generateConversationTitle(tempUpdatedConv); 
      }
      // --- End title logic ---
      
      const updatedConversation = {
        ...conversation,
        title,
        messages: updatedMessagesMap,
        firstMessageId: updatedFirstMessageId,
        updatedAt: new Date().toISOString(),
      };
      
      const updatedConversations = {
        ...state.conversations,
        [conversationId]: updatedConversation,
      };
      // Note: _addMessageNode is usually called twice in sendMessage.
      // Saving is deferred to the end of sendMessage or regenerateResponse.
      // saveConversationsToStorage(updatedConversations); 

      return { conversations: updatedConversations };
    });
  },
  
  /**
   * Updates the content of a specific version of a message.
   * Used during streaming responses.
   * @param {string} conversationId - The conversation ID.
   * @param {string} messageId - The message node ID.
   * @param {string} versionId - The specific version ID to update.
   * @param {string} newContent - The new content for the version.
   */
  updateMessageVersionContent: (conversationId, messageId, versionId, newContent) => {
    set((state) => {
      const conversation = state.conversations[conversationId];
      // Basic checks
      if (!conversation?.messages?.[messageId]?.versions) {
        // console.warn(`[updateMessageVersionContent] Invalid path: ${conversationId}, ${messageId}`);
        return state; // Avoid errors if structure is missing
      }
      const messageNode = conversation.messages[messageId];
      const versionIndex = messageNode.versions.findIndex(v => v.id === versionId);
      if (versionIndex === -1) {
        // console.warn(`[updateMessageVersionContent] Version not found: ${versionId} in Msg ${messageId}`);
        return state; // Ignore if version doesn't exist
      }

      // --- Immutable update path ---
      const updatedVersion = { ...messageNode.versions[versionIndex], content: newContent };
      const updatedVersions = [
          ...messageNode.versions.slice(0, versionIndex),
          updatedVersion,
          ...messageNode.versions.slice(versionIndex + 1),
      ];
      const updatedMessageNode = { ...messageNode, versions: updatedVersions };
      const updatedMessages = { ...conversation.messages, [messageId]: updatedMessageNode };
      // Only update content, don't change conversation's main updatedAt here; let caller decide.
      const updatedConversation = { ...conversation, messages: updatedMessages }; 
      // --- End Immutable update path ---

      return { 
        conversations: { ...state.conversations, [conversationId]: updatedConversation } 
      }; 
    });
    // Note: localStorage saving is deferred to the end of the streaming process (onDone/onError).
  },
  
  /**
   * Sends a user message, gets a response from the API, and updates the conversation.
   * Handles streaming responses.
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
    const { 
      currentProvider, currentModel, providers, systemPrompt,
      temperature = 0.7, maxTokens = 8192, 
    } = settings;
    const apiKey = providers[currentProvider]?.apiKey;

    if (!apiKey) {
      set({ error: 'API key is not set. Please add your API key in Settings.', isLoading: false });
      return;
    }
    
    let userMessageNode = null;
    let assistantMessageNode = null;
    let assistantVersionId = null;

    try {
      set({ isLoading: true, error: null });
      
      // 1. Create and add User Message Node
      userMessageNode = createMessage({ role: 'user', content, images });
      get()._addMessageNode(conversationId, userMessageNode); // Links previous -> user
      
      // 2. Create and add Assistant Placeholder Node
      assistantMessageNode = createMessage({ role: 'assistant', content: '' });
      assistantVersionId = assistantMessageNode.activeVersionId; // Get the initial version ID
      get()._addMessageNode(conversationId, assistantMessageNode); // Links user -> assistant placeholder

      // --- Get conversation state *after* adding both nodes ---
      const conversationForApi = get().conversations[conversationId]; 
      if (!conversationForApi) throw new Error("Conversation disappeared after adding messages.");

      // 3. Prepare API Call
      const { createApiService } = await import('@/lib/api/api-service');
      const apiService = createApiService(currentProvider, apiKey);
      const messagesForApi = formatMessagesForProvider(conversationForApi, currentProvider, systemPrompt);
      
      // 4. Make API Call
      const response = await apiService.chatCompletion(messagesForApi, currentModel, {
        temperature, maxTokens, stream: true,
      });

      // 5. Handle Response
      if (response.stream) {
        let streamContent = '';
        const targetAssistantId = assistantMessageNode.id; // Use ID captured earlier
        const targetVersionId = assistantVersionId; // Use version ID captured earlier

        const onChunk = (chunk) => {
          streamContent += chunk;
          get().updateMessageVersionContent(conversationId, targetAssistantId, targetVersionId, streamContent);
        };
        
        const onDone = (finalContent) => {
          get().updateMessageVersionContent(conversationId, targetAssistantId, targetVersionId, finalContent);
          // Final state update: set timestamp, save, and stop loading
          set(state => {
             const conv = state.conversations[conversationId];
             if (!conv) return state;
             const updatedConv = { ...conv, updatedAt: new Date().toISOString() };
             const updatedConversations = { ...state.conversations, [conversationId]: updatedConv };
             saveConversationsToStorage(updatedConversations);
             return { conversations: updatedConversations, isLoading: false };
          });
        };
        
        const onError = (error) => {
          console.error('[sendMessage] Streaming error:', error);
          const errorContent = 'I apologize, but an error occurred during streaming.';
          get().updateMessageVersionContent(conversationId, targetAssistantId, targetVersionId, errorContent);
          set(state => {
             const conv = state.conversations[conversationId];
             if (!conv) return state;
             const updatedConv = { ...conv, updatedAt: new Date().toISOString() };
             const updatedConversations = { ...state.conversations, [conversationId]: updatedConv };
             saveConversationsToStorage(updatedConversations); // Save even on error
             return { 
               conversations: updatedConversations,
               error: 'Error during response streaming: ' + error.message,
               isLoading: false 
             };
          });
        };
        
        // Process stream based on provider
        if (response.provider === 'openai') await handleOpenAIStream(response.stream, onChunk, onDone, onError);
        else if (response.provider === 'anthropic') await handleAnthropicStream(response.stream, onChunk, onDone, onError);
        else if (response.provider === 'google') await handleGoogleAIStream(response.stream, onChunk, onDone, onError);
        else onError(new Error(`Streaming not implemented for provider: ${response.provider}`));

      } else { // Handle Non-Streaming Response (Fallback)
        const finalContent = response.content || 'Error: No content received.';
        get().updateMessageVersionContent(conversationId, assistantMessageNode.id, assistantVersionId, finalContent);
        set(state => {
             const conv = state.conversations[conversationId];
             if (!conv) return state;
             const updatedConv = { ...conv, updatedAt: new Date().toISOString() };
             const updatedConversations = { ...state.conversations, [conversationId]: updatedConv };
             saveConversationsToStorage(updatedConversations);
             return { conversations: updatedConversations, isLoading: false };
        });
      }
    } catch (error) {
      console.error('[sendMessage] Outer error:', error);
      const errorMsg = error.message || 'An error occurred while sending the message.';
      set({ error: errorMsg, isLoading: false });
      
      // Update placeholder with error message if it was created
      if (assistantMessageNode && assistantVersionId) {
         get().updateMessageVersionContent(conversationId, assistantMessageNode.id, assistantVersionId, `Error: ${errorMsg}`);
         // Save state with error message
         set(state => {
             const conv = state.conversations[conversationId];
             if (!conv) return state;
             const updatedConv = { ...conv, updatedAt: new Date().toISOString() };
             const updatedConversations = { ...state.conversations, [conversationId]: updatedConv };
             saveConversationsToStorage(updatedConversations);
             return { conversations: updatedConversations };
         });
      } else {
         // If assistant node wasn't even created, ensure storage is saved if user node was added
         const currentConversations = get().conversations;
         saveConversationsToStorage(currentConversations);
      }
    } 
  },

  /**
   * Deletes a message node and effectively removes all subsequent messages in that specific active branch
   * by setting the predecessor's forward pointers to null.
   * @param {string} conversationId - The conversation ID.
   * @param {string} messageIdToDelete - The ID of the message node to delete.
   */
  deleteMessage: (conversationId, messageIdToDelete) => {
    set((state) => {
      const conversation = state.conversations[conversationId];
      if (!conversation?.messages?.[messageIdToDelete]) {
         console.warn(`[deleteMessage] Conversation or message ${messageIdToDelete} not found.`);
         return state;
      }

      // --- Create a mutable copy for modifications ---
      // Note: We still need immutable updates for the final state, but copying makes finding/modifying easier.
      const messagesMap = { ...conversation.messages }; 
      
      // Find the predecessor in the *current active chain* before deletion
      const { precedingMessageId, precedingVersionId } = findPrecedingMessage(conversation, messageIdToDelete);

      // --- Remove the target message node ---
      // We don't strictly need its pointers anymore as we're cutting the branch before it.
      delete messagesMap[messageIdToDelete]; 
      console.log(`[deleteMessage] Removed node ${messageIdToDelete}`);

      let updatedFirstMessageId = conversation.firstMessageId;

      // --- Update the Predecessor to terminate the branch ---
      if (precedingMessageId && precedingVersionId) {
          const prevNode = messagesMap[precedingMessageId]; // Get from the map (might be updated if deleting sequentially)
          
          // Ensure the predecessor node still exists in our map
          if (prevNode?.versions) { 
              const prevVersionIndex = prevNode.versions.findIndex(v => v.id === precedingVersionId);
              
              if (prevVersionIndex !== -1) {
                  // Create a new version object with null forward pointers
                  const updatedPrevVersion = { 
                      ...prevNode.versions[prevVersionIndex], 
                      nextMessageId: null,          // Cut the link forward
                      nextMessageVersionId: null    // Cut the link forward
                  };
                  // Create a new versions array for the predecessor
                  const updatedPrevVersions = [
                    ...prevNode.versions.slice(0, prevVersionIndex),
                    updatedPrevVersion,
                    ...prevNode.versions.slice(prevVersionIndex + 1),
                  ];
                  // Create a new node object for the predecessor
                  // Use precedingMessageId (fixed typo from prevMessageId)
                  messagesMap[precedingMessageId] = { ...prevNode, versions: updatedPrevVersions }; 
                  console.log(`[deleteMessage] Terminated branch at predecessor ${precedingMessageId}/${precedingVersionId}`);
              } else {
                 // This could happen if the active chain changed between finding the predecessor and now.
                 console.warn(`[deleteMessage] Preceding version ${precedingVersionId} not found in node ${precedingMessageId} during update. Branch termination might be incomplete.`);
              }
          } else {
             // This could happen if the predecessor itself was deleted in the same operation or concurrently.
             console.warn(`[deleteMessage] Preceding node ${precedingMessageId} not found after deleting ${messageIdToDelete}. Branch termination failed.`);
          }
      } else if (conversation.firstMessageId === messageIdToDelete) {
          // We deleted the very first message of the conversation.
          updatedFirstMessageId = null; // The conversation is now effectively empty.
          console.log(`[deleteMessage] Deleted the first message ${messageIdToDelete}. Setting firstMessageId to null.`);
      }
      
      // Note: Nodes after the deleted one in this specific branch are now orphaned.
      // A separate garbage collection process could clean them up later if needed.

      // --- Create the final immutable state update ---
      const updatedConversation = {
        ...conversation, // Start with original conversation
        messages: messagesMap, // Use the modified messages map
        firstMessageId: updatedFirstMessageId, // Use the potentially updated first ID
        updatedAt: new Date().toISOString(),
      };
      
      const updatedConversations = {
        ...state.conversations,
        [conversationId]: updatedConversation,
      };
      
      saveConversationsToStorage(updatedConversations); // Save the final state
      return { conversations: updatedConversations };
    });
  },

  /**
   * Regenerates the response for an assistant message.
   * Creates a new version, makes it active, and updates pointers to create a new branch end.
   * @param {string} conversationId - The conversation ID.
   * @param {string} messageIdToRegenerate - The ID of the assistant message node to regenerate.
   */
  regenerateResponse: async (conversationId, messageIdToRegenerate) => {
    const initialConversation = get().conversations[conversationId]; 
    if (!initialConversation?.messages?.[messageIdToRegenerate]) {
      console.warn("[regenerateResponse] Conversation or message node not found.");
      return;
    }
    const messageNodeToRegenerate = initialConversation.messages[messageIdToRegenerate];
    if (messageNodeToRegenerate.role !== 'assistant') {
      console.warn("[regenerateResponse] Cannot regenerate a non-assistant message.");
      return;
    }

    set({ isLoading: true, error: null }); 
    let newVersionId = null; // To store the ID of the new version

    try {
      // 1. Find the message preceding the one to regenerate (using initial state)
      const { precedingMessageId, precedingVersionId } = findPrecedingMessage(initialConversation, messageIdToRegenerate);

      // 2. Get settings and API key
      const settings = useSettingsStore.getState();
      const { 
        currentProvider, currentModel, providers, systemPrompt,
        temperature = 0.7, maxTokens = 4096,
      } = settings;
      const apiKey = providers[currentProvider]?.apiKey;
      if (!apiKey) throw new Error('API key is not set for regeneration.');

      // 3. Format messages for API (context up to the predecessor)
      const messagesForApi = formatMessagesForProvider(
         initialConversation, currentProvider, systemPrompt,
         precedingMessageId, precedingVersionId 
      );
      
      // 4. Prepare API Service
      const { createApiService } = await import('@/lib/api/api-service');
      const apiService = createApiService(currentProvider, apiKey);

      // 5. Create placeholder version, set active, update predecessor pointer, set null next pointers
      const placeholderContent = ""; 
      set((state) => {
        const conv = state.conversations[conversationId]; 
        if (!conv?.messages?.[messageIdToRegenerate]?.versions) {
           console.warn(`[regenerateResponse:set] Conv/Msg/Versions disappeared.`);
           return { ...state, isLoading: false }; 
        }
        const node = conv.messages[messageIdToRegenerate];
        
        const tempNewVersionId = generateId();
        newVersionId = tempNewVersionId; // Capture ID

        // New version is the end of a new branch
        const newVersion = {
            id: tempNewVersionId, content: placeholderContent, createdAt: new Date().toISOString(),
            nextMessageId: null, nextMessageVersionId: null, 
        };

        const updatedVersions = [...node.versions, newVersion];
        const updatedRegeneratedNode = { ...node, versions: updatedVersions, activeVersionId: tempNewVersionId };

        // --- Update Predecessor Pointer ---
        let updatedMessages = { ...conv.messages, [messageIdToRegenerate]: updatedRegeneratedNode }; 
        if (precedingMessageId && precedingVersionId) {
          const precedingNode = conv.messages[precedingMessageId]; 
          if (precedingNode?.versions) {
            const precedingVersionIndex = precedingNode.versions.findIndex(v => v.id === precedingVersionId);
            if (precedingVersionIndex !== -1) {
              const updatedPrecedingVersion = { ...precedingNode.versions[precedingVersionIndex], nextMessageVersionId: tempNewVersionId };
              const updatedPrecedingVersions = [
                ...precedingNode.versions.slice(0, precedingVersionIndex), updatedPrecedingVersion, ...precedingNode.versions.slice(precedingVersionIndex + 1),
              ];
              updatedMessages[precedingMessageId] = { ...precedingNode, versions: updatedPrecedingVersions };
              // console.log(`[regenerateResponse:set] Updated predecessor ${precedingMessageId}/${precedingVersionId} -> ${tempNewVersionId}`);
            } 
          } 
        }
        // --- End Update Predecessor ---

        const updatedConversation = { ...conv, messages: updatedMessages, updatedAt: new Date().toISOString() };
        // Don't save here, save onDone/onError
        return { conversations: { ...state.conversations, [conversationId]: updatedConversation }, isLoading: true, error: null }; 
      });

      // --- Check if placeholder was created ---
      const targetVersionId = newVersionId; 
      if (!targetVersionId) throw new Error("Failed to create placeholder version (set call aborted?).");
      
      // 6. Make API Call
      const response = await apiService.chatCompletion(messagesForApi, currentModel, {
        temperature, maxTokens, stream: true,
      });

      // 7. Handle Response (Streaming preferred)
      if (response.stream) {
        let streamContent = '';
        const targetAssistantId = messageIdToRegenerate; // Use ID captured earlier

        const onChunk = (chunk) => {
          streamContent += chunk;
          get().updateMessageVersionContent(conversationId, targetAssistantId, targetVersionId, streamContent);
        };
        const onDone = (finalContent) => {
          get().updateMessageVersionContent(conversationId, targetAssistantId, targetVersionId, finalContent);
          set(state => {
             const conv = state.conversations[conversationId];
             if (!conv) return state;
             const finalConv = { ...conv, updatedAt: new Date().toISOString() }; 
             const updatedConversations = { ...state.conversations, [conversationId]: finalConv };
             saveConversationsToStorage(updatedConversations);
             // console.log(`[regenerateResponse] Done for version ${targetVersionId}`);
             return { conversations: updatedConversations, isLoading: false }; 
          });
        };
        const onError = (error) => {
          console.error('[regenerateResponse] Streaming error:', error);
          const errorContent = 'I apologize, but an error occurred during regeneration.';
          get().updateMessageVersionContent(conversationId, targetAssistantId, targetVersionId, errorContent);
          set(state => {
             const conv = state.conversations[conversationId];
             if (!conv) return state;
             const finalConv = { ...conv, updatedAt: new Date().toISOString() }; 
             const updatedConversations = { ...state.conversations, [conversationId]: finalConv };
             saveConversationsToStorage(updatedConversations);
             return { 
               conversations: updatedConversations,
               error: 'Error during regeneration streaming: ' + error.message,
               isLoading: false 
             };
          });
        };
        
        if (response.provider === 'openai') await handleOpenAIStream(response.stream, onChunk, onDone, onError);
        else if (response.provider === 'anthropic') await handleAnthropicStream(response.stream, onChunk, onDone, onError);
        else if (response.provider === 'google') await handleGoogleAIStream(response.stream, onChunk, onDone, onError);
        else onError(new Error(`Streaming not implemented for provider: ${response.provider}`));

      } else { // Handle Non-Streaming Response
        const finalContent = response.content || 'Error: No content received.';
        get().updateMessageVersionContent(conversationId, messageIdToRegenerate, targetVersionId, finalContent);
        set(state => {
             const conv = state.conversations[conversationId];
             if (!conv) return state;
             const finalConv = { ...conv, updatedAt: new Date().toISOString() }; 
             const updatedConversations = { ...state.conversations, [conversationId]: finalConv };
             saveConversationsToStorage(updatedConversations);
             return { conversations: updatedConversations, isLoading: false }; 
        });
      }
    } catch (error) {
      console.error('[regenerateResponse] Outer error:', error);
      const errorMsg = error.message || 'An error occurred during regeneration.';
      set({ error: errorMsg, isLoading: false }); 
      
      // Attempt to update placeholder with error if it was created
      const capturedVersionId = newVersionId; 
      if (capturedVersionId) {
         get().updateMessageVersionContent(conversationId, messageIdToRegenerate, capturedVersionId, `Error: ${errorMsg}`);
         set(state => {
             const conv = state.conversations[conversationId];
             if (!conv) return state;
             const finalConv = { ...conv, updatedAt: new Date().toISOString() }; 
             const updatedConversations = { ...state.conversations, [conversationId]: finalConv };
             saveConversationsToStorage(updatedConversations);
             return { conversations: updatedConversations }; 
         });
      } else {
         // Ensure storage is saved if initial state was modified before error
         const currentConversations = get().conversations;
         saveConversationsToStorage(currentConversations);
      }
    }
  },
  
  /**
   * Switches the active version for a given message node and updates the predecessor's pointer.
   * @param {string} conversationId - The conversation ID.
   * @param {string} messageId - The ID of the message node to switch.
   * @param {string} newVersionId - The ID of the version to make active.
   */
  switchActiveMessageVersion: (conversationId, messageId, newVersionId) => {
     set((state) => {
        const conversation = state.conversations[conversationId];
        if (!conversation?.messages?.[messageId]?.versions) {
           console.warn(`[switchActiveMessageVersion] Invalid path: ${conversationId}, ${messageId}`);
           return state;
        }
        const messageNodeToSwitch = conversation.messages[messageId];
        const versionExists = messageNodeToSwitch.versions.some(v => v.id === newVersionId);
        // Prevent switching if version doesn't exist or is already active
        if (!versionExists || messageNodeToSwitch.activeVersionId === newVersionId) {
           // console.warn(`[switchActiveMessageVersion] Version ${newVersionId} invalid or already active for ${messageId}`);
           return state;
        }

        // Find the predecessor in the *current active chain* before the switch
        const { precedingMessageId, precedingVersionId } = findPrecedingMessage(conversation, messageId);

        let updatedMessages = { ...conversation.messages }; 

        // --- Update Preceding Message's Pointer ---
        if (precedingMessageId && precedingVersionId) {
          const precedingNode = conversation.messages[precedingMessageId]; // Use conversation state from set
          if (precedingNode?.versions) {
            const precedingVersionIndex = precedingNode.versions.findIndex(v => v.id === precedingVersionId);
            if (precedingVersionIndex !== -1) {
              // Create new version object with updated pointer
              const updatedPrecedingVersion = { ...precedingNode.versions[precedingVersionIndex], nextMessageVersionId: newVersionId };
              // Create new versions array
              const updatedPrecedingVersions = [
                ...precedingNode.versions.slice(0, precedingVersionIndex), updatedPrecedingVersion, ...precedingNode.versions.slice(precedingVersionIndex + 1),
              ];
              // Create new node object
              updatedMessages[precedingMessageId] = { ...precedingNode, versions: updatedPrecedingVersions };
              // console.log(`[switchActiveMessageVersion] Updated predecessor ${precedingMessageId}/${precedingVersionId} -> ${newVersionId}`);
            } 
          } 
        }
        // --- End Update Preceding ---

        // --- Update the Target Message's Active Version ---
        updatedMessages[messageId] = { ...messageNodeToSwitch, activeVersionId: newVersionId };
        // --- End Update Target ---

        const updatedConversation = { ...conversation, messages: updatedMessages, updatedAt: new Date().toISOString() };
        const updatedConversations = { ...state.conversations, [conversationId]: updatedConversation };

        // console.log(`[switchActiveMessageVersion] Switched ${messageId} to version ${newVersionId}`);
        saveConversationsToStorage(updatedConversations); // Save updated state
        return { conversations: updatedConversations }; 
     });
  },

  // --- Initialization and Utility Actions ---

  /**
   * Loads conversations from localStorage on client-side initialization.
   * Handles missing or potentially corrupted data.
   */
  loadConversations: () => {
    if (typeof window === 'undefined') return; // Only run on client
    
    let loadedConversations = {};
    try {
      const savedData = localStorage.getItem('ai-conversations');
      if (savedData) {
         loadedConversations = JSON.parse(savedData);
         // TODO: Add schema validation/migration logic here if format evolves significantly
      }
    } catch (error) {
      console.error('Failed to load or parse conversations from localStorage:', error);
      localStorage.removeItem('ai-conversations'); // Clear potentially corrupted data
    }

    // Ensure there's at least one conversation
    if (Object.keys(loadedConversations).length === 0) {
      const newConversation = generateNewConversation();
      loadedConversations[newConversation.id] = newConversation;
      saveConversationsToStorage(loadedConversations); // Save the initial one
      set({ 
        conversations: loadedConversations, 
        activeConversationId: newConversation.id 
      });
    } else {
      set({ conversations: loadedConversations });
      // Ensure activeConversationId is valid, defaulting to the most recently updated
      const currentActiveId = get().activeConversationId;
      if (!currentActiveId || !loadedConversations[currentActiveId]) {
        const conversationIds = Object.keys(loadedConversations);
        conversationIds.sort((a, b) => 
           new Date(loadedConversations[b].updatedAt) - new Date(loadedConversations[a].updatedAt)
        );
        set({ activeConversationId: conversationIds[0] });
      }
    }
  },
  
  /**
   * Clears all conversations and creates a single new one.
   */
  clearAllConversations: () => {
    const newConversation = generateNewConversation();
    const newState = { [newConversation.id]: newConversation };
    set({
      conversations: newState,
      activeConversationId: newConversation.id,
      isLoading: false, // Reset loading/error states
      error: null,
    });
    saveConversationsToStorage(newState); // Save cleared state
  },
  
  /**
   * Exports a specific conversation as a JSON object.
   * @param {string} conversationId - The ID of the conversation to export.
   * @returns {object | null} A deep copy of the conversation object or null if not found.
   */
  exportConversation: (conversationId) => {
    const conversation = get().conversations[conversationId];
    if (!conversation) return null;
    // Return a deep copy to prevent downstream mutations affecting the store
    try {
      return JSON.parse(JSON.stringify({
        ...conversation,
        exportedAt: new Date().toISOString(), // Add export timestamp
      }));
    } catch (error) {
       console.error("Failed to deep clone conversation for export:", error);
       return null;
    }
  },
  
  /**
   * Imports a conversation object into the store.
   * @param {object} conversationData - The conversation data to import.
   * @returns {string | null} The ID of the imported conversation or null on failure.
   */
  importConversation: (conversationData) => {
    try {
      // Basic validation
      if (!conversationData || typeof conversationData.messages !== 'object' || conversationData.messages === null) {
         throw new Error("Invalid conversation format: 'messages' map is missing or invalid.");
      }
      // TODO: Add more robust schema validation if needed

      // Ensure essential fields exist, generate ID if missing
      const conversation = {
        ...conversationData,
        id: conversationData.id || generateId(), 
        createdAt: conversationData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(), // Set import time as updated time
        firstMessageId: conversationData.firstMessageId || null, 
      };
      
      get().addConversation(conversation); // Use addConversation to add and save
      return conversation.id; // Return the ID of the imported conversation
    } catch (error) {
      console.error('Failed to import conversation:', error);
      set({ error: 'Failed to import conversation: ' + error.message });
      return null;
    }
  },

}));

// --- Initialize Store ---
// Load conversations from localStorage when the store is initialized on the client
if (typeof window !== 'undefined') {
  useConversationsStore.getState().loadConversations();
}