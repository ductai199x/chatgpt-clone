'use client';

import { create } from 'zustand';
import { createMessage, generateConversationTitle, generateNewConversation } from '@/lib/utils/conversation';
import { handleOpenAIStream, handleAnthropicStream, handleGoogleAIStream } from '../utils/streaming-handler';
import { useSettingsStore } from './settings-store';

export const useConversationsStore = create((set, get) => ({
  // State
  conversations: {},
  activeConversationId: null,
  isLoading: false,
  error: null,
  
  // Actions
  addConversation: (conversation) => {
    set((state) => ({
      conversations: {
        ...state.conversations,
        [conversation.id]: conversation,
      },
      activeConversationId: conversation.id,
    }));
    // Save to localStorage
    localStorage.setItem('ai-conversations', JSON.stringify({
      ...get().conversations,
      [conversation.id]: conversation,
    }));
  },
  
  setActiveConversation: (conversationId) => {
    set({ activeConversationId: conversationId });
  },
  
  updateConversation: (conversationId, updates) => {
    set((state) => {
      const conversation = state.conversations[conversationId];
      if (!conversation) return state;
      
      const updatedConversation = {
        ...conversation,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      
      return {
        conversations: {
          ...state.conversations,
          [conversationId]: updatedConversation,
        },
      };
    });
    
    // Save to localStorage
    localStorage.setItem('ai-conversations', JSON.stringify(get().conversations));
  },
  
  deleteConversation: (conversationId) => {
    set((state) => {
      const newConversations = { ...state.conversations };
      delete newConversations[conversationId];
      
      // If we're deleting the active conversation, set a new active conversation
      let newActiveId = state.activeConversationId;
      if (state.activeConversationId === conversationId) {
        const conversationIds = Object.keys(newConversations);
        newActiveId = conversationIds.length > 0 ? conversationIds[0] : null;
      }
      
      return {
        conversations: newConversations,
        activeConversationId: newActiveId,
      };
    });
    
    // Save to localStorage
    localStorage.setItem('ai-conversations', JSON.stringify(get().conversations));
  },
  
  addMessage: (conversationId, message) => {
    set((state) => {
      const conversation = state.conversations[conversationId];
      if (!conversation) return state;
      
      const updatedMessages = [...conversation.messages, message];
      
      // Auto-generate title from first user message if enabled
      const settings = useSettingsStore.getState();
      let title = conversation.title;
      
      if (settings.interface.autoTitleConversations && 
          conversation.title === 'New chat' && 
          message.role === 'user' && 
          updatedMessages.length === 1) {
        title = generateConversationTitle(message);
      }
      
      const updatedConversation = {
        ...conversation,
        title,
        messages: updatedMessages,
        updatedAt: new Date().toISOString(),
      };
      
      return {
        conversations: {
          ...state.conversations,
          [conversationId]: updatedConversation,
        },
      };
    });
    
    // Save to localStorage
    localStorage.setItem('ai-conversations', JSON.stringify(get().conversations));
  },
  
  updateMessage: (conversationId, messageId, updates) => {
    set((state) => {
      const conversation = state.conversations[conversationId];
      if (!conversation) return state;
      
      const updatedMessages = conversation.messages.map((msg) => {
        if (msg.id === messageId) {
          return { ...msg, ...updates };
        }
        return msg;
      });
      
      return {
        conversations: {
          ...state.conversations,
          [conversationId]: {
            ...conversation,
            messages: updatedMessages,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
    
    // Save to localStorage
    localStorage.setItem('ai-conversations', JSON.stringify(get().conversations));
  },
  
  // Send a message and get a response
  sendMessage: async (conversationId, content, images = []) => {
    const conversation = get().conversations[conversationId];
    if (!conversation) return;
    
    const settings = useSettingsStore.getState();
    const { currentProvider, currentModel, providers, systemPrompt } = settings;
    const apiKey = providers[currentProvider]?.apiKey;

    // Don't proceed if no API key
    if (!apiKey) {
      set({ error: 'API key is not set. Please add your API key in Settings.' });
      return;
    }
    
    try {
      // Set loading state
      set({ isLoading: true, error: null });
      
      // Create and add user message
      const userMessage = createMessage({ role: 'user', content, images });
      
      // Update the state with the user message
      set(state => {
        const updatedConversation = {
          ...state.conversations[conversationId],
          messages: [...state.conversations[conversationId].messages, userMessage],
          updatedAt: new Date().toISOString(),
        };
        
        // Update conversation title if this is the first message
        if (state.conversations[conversationId].messages.length === 0 && 
            settings.interface.autoTitleConversations &&
            updatedConversation.title === 'New chat') {
          updatedConversation.title = generateConversationTitle(userMessage);
        }
        
        // Update local storage
        const updatedConversations = {
          ...state.conversations,
          [conversationId]: updatedConversation,
        };
        
        localStorage.setItem('ai-conversations', JSON.stringify(updatedConversations));
        
        return {
          conversations: updatedConversations,
        };
      });

      // Create placeholder for assistant's response
      const assistantMessage = createMessage({ 
        role: 'assistant', 
        content: '' 
      });
      
      // Add the placeholder to the conversation
      set(state => {
        const updatedConversation = {
          ...state.conversations[conversationId],
          messages: [...state.conversations[conversationId].messages, assistantMessage],
          updatedAt: new Date().toISOString(),
        };
        
        // Update local storage
        const updatedConversations = {
          ...state.conversations,
          [conversationId]: updatedConversation,
        };
        
        localStorage.setItem('ai-conversations', JSON.stringify(updatedConversations));
        
        return {
          conversations: updatedConversations,
        };
      });
      
      // Import the API service dynamically to handle client-side only code
      const { createApiService } = await import('@/lib/api/api-service');
      const apiService = createApiService(currentProvider, apiKey);
      
      // Get the updated conversation to ensure we have all messages
      const updatedConversation = get().conversations[conversationId];
      
      // Prepare the messages for the API
      const allMessages = [
        // Add system message if available
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        // Get all messages except the placeholder assistant message
        ...updatedConversation.messages.filter(msg => msg.id !== assistantMessage.id)
      ];
      console.log('allMessages', allMessages);
      
      // Make the API call
      const response = await apiService.chatCompletion(allMessages, currentModel, {
        // Optional parameters
        temperature: 0.7,
        maxTokens: 4096,
        stream: true,
      });
      
      // Update the assistant message with the response
      // If we have a stream
      if (response.stream) {
        let streamContent = '';
        
        const onChunk = (chunk) => {
          // Update the message content with each chunk
          streamContent += chunk;
          
          // Update the assistant message with the partial content
          set(state => {
            const currentMessages = state.conversations[conversationId].messages;
            const updatedMessages = currentMessages.map(msg => 
              msg.id === assistantMessage.id 
                ? { ...msg, content: streamContent }
                : msg
            );
            
            const updatedConversation = {
              ...state.conversations[conversationId],
              messages: updatedMessages,
            };
            
            return {
              conversations: {
                ...state.conversations,
                [conversationId]: updatedConversation,
              },
            };
          });
        };
        
        const onDone = (finalContent) => {
          // Update the final message content and save to localStorage
          set(state => {
            const currentMessages = state.conversations[conversationId].messages;
            const updatedMessages = currentMessages.map(msg => 
              msg.id === assistantMessage.id 
                ? { ...msg, content: finalContent }
                : msg
            );
            
            const updatedConversation = {
              ...state.conversations[conversationId],
              messages: updatedMessages,
              updatedAt: new Date().toISOString(),
            };
            
            const updatedConversations = {
              ...state.conversations,
              [conversationId]: updatedConversation,
            };
            
            // Save to localStorage
            localStorage.setItem('ai-conversations', JSON.stringify(updatedConversations));
            
            return {
              conversations: updatedConversations,
              isLoading: false,
            };
          });
        };
        
        const onError = (error) => {
          console.error('Streaming error:', error);
          set({ 
            error: 'Error during response streaming: ' + error.message,
            isLoading: false
          });
        };
        
        // Process the stream based on the provider
        if (response.provider === 'openai') {
          await handleOpenAIStream(response.stream, onChunk, onDone, onError);
        } else if (response.provider === 'anthropic') {
          await handleAnthropicStream(response.stream, onChunk, onDone, onError);
        } else if (response.provider === 'google') {
          await handleGoogleAIStream(response.stream, onChunk, onDone, onError);
        }
      } else {
        // If not streaming (fallback)
        set(state => {
          const currentMessages = state.conversations[conversationId].messages;
          const updatedMessages = currentMessages.map(msg => 
            msg.id === assistantMessage.id 
              ? { ...msg, content: response.content }
              : msg
          );
          
          const updatedConversation = {
            ...state.conversations[conversationId],
            messages: updatedMessages,
            updatedAt: new Date().toISOString(),
          };
          
          // Update local storage
          const updatedConversations = {
            ...state.conversations,
            [conversationId]: updatedConversation,
          };
          
          localStorage.setItem('ai-conversations', JSON.stringify(updatedConversations));
          
          return {
            conversations: updatedConversations,
            isLoading: false,
          };
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      set({ error: error.message || 'An error occurred while sending your message.' });
      
      // Update the assistant message to show the error
      const currentMessages = get().conversations[conversationId].messages;
      const assistantMessageIndex = currentMessages.findIndex(msg => 
        msg.role === 'assistant' && msg.content === ''
      );
      
      if (assistantMessageIndex !== -1) {
        const assistantMessage = currentMessages[assistantMessageIndex];
        
        set(state => {
          const updatedMessages = [...currentMessages];
          updatedMessages[assistantMessageIndex] = {
            ...assistantMessage,
            content: 'I apologize, but I encountered an error while processing your message. Please try again.',
            error: true,
          };
          
          const updatedConversation = {
            ...state.conversations[conversationId],
            messages: updatedMessages,
            updatedAt: new Date().toISOString(),
          };
          
          // Update local storage
          const updatedConversations = {
            ...state.conversations,
            [conversationId]: updatedConversation,
          };
          
          localStorage.setItem('ai-conversations', JSON.stringify(updatedConversations));
          
          return {
            conversations: updatedConversations,
          };
        });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  deleteMessage: (conversationId, messageId) => {
    set((state) => {
      const conversation = state.conversations[conversationId];
      if (!conversation) return state;
      
      // Find the index of the message to delete
      const messageIndex = conversation.messages.findIndex(msg => msg.id === messageId);
      if (messageIndex === -1) return state;
      
      // Determine if we should delete all subsequent messages (if it's a user message)
      const isUserMessage = conversation.messages[messageIndex].role === 'user';
      
      // Create new messages array:
      // If it's a user message, remove it and all following messages
      // If it's an assistant message, just remove that specific message
      const updatedMessages = isUserMessage
        ? conversation.messages.slice(0, messageIndex)
        : conversation.messages.filter((_, idx) => idx !== messageIndex);
      
      const updatedConversation = {
        ...conversation,
        messages: updatedMessages,
        updatedAt: new Date().toISOString(),
      };
      
      const updatedConversations = {
        ...state.conversations,
        [conversationId]: updatedConversation,
      };
      
      // Save to localStorage
      localStorage.setItem('ai-conversations', JSON.stringify(updatedConversations));
      
      return {
        conversations: updatedConversations,
      };
    });
  },
  
  // Load conversations from localStorage
  loadConversations: () => {
    if (typeof window === 'undefined') return;
    
    try {
      const savedConversations = JSON.parse(localStorage.getItem('ai-conversations') || '{}');
      
      if (Object.keys(savedConversations).length > 0) {
        set({ conversations: savedConversations });
        
        // Set an active conversation if none is set
        if (!get().activeConversationId) {
          const conversationIds = Object.keys(savedConversations);
          if (conversationIds.length > 0) {
            set({ activeConversationId: conversationIds[0] });
          }
        }
      } else {
        // If no conversations exist, create a new one
        const newConversation = generateNewConversation();
        get().addConversation(newConversation);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
      
      // Create a new conversation as fallback
      const newConversation = generateNewConversation();
      get().addConversation(newConversation);
    }
  },
  
  // Clear all conversations
  clearAllConversations: () => {
    const newConversation = generateNewConversation();
    
    set({
      conversations: {
        [newConversation.id]: newConversation,
      },
      activeConversationId: newConversation.id,
    });
    
    // Save to localStorage
    localStorage.setItem('ai-conversations', JSON.stringify({
      [newConversation.id]: newConversation,
    }));
  },
  
  // Export conversation
  exportConversation: (conversationId) => {
    const conversation = get().conversations[conversationId];
    if (!conversation) return null;
    
    return {
      ...conversation,
      exportedAt: new Date().toISOString(),
    };
  },
  
  // Import conversation
  importConversation: (conversationData) => {
    try {
      const conversation = {
        ...conversationData,
        id: conversationData.id || generateId(),
        updatedAt: new Date().toISOString(),
      };
      
      get().addConversation(conversation);
      return conversation.id;
    } catch (error) {
      console.error('Failed to import conversation:', error);
      set({ error: 'Failed to import conversation. The format may be invalid.' });
      return null;
    }
  },
}));