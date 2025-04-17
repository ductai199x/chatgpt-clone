'use client';

// --- Imports ---
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useConversationsStore } from '@/lib/store/conversations-store';
import { useSettingsStore } from '@/lib/store/settings-store';
import { getActiveMessageChain } from '@/lib/utils/conversation';
import ChatMessage from './chat-message';
import MessageInput from './message-input';
import WelcomeScreen from './welcome-screen';
import { ArrowDown, Trash2 } from 'lucide-react'; // Import icons

export default function ChatInterface({ conversationId }) {
  // --- Refs ---
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isUserScrollingRef = useRef(false); // Track if user initiated scroll
  const scrollTimeoutRef = useRef(null); // Ref for scroll detection timeout
  const wasLoadingRef = useRef(false); // Track previous loading state

  // --- State ---
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false); 

  // --- Store Selectors ---
  const { currentProvider, currentModel } = useSettingsStore();
  
  // Memoized selector for conversation data + actions
  // Note: Using useCallback + shallow is often preferred for object selectors
  // but sticking to the current pattern as requested.
  const conversationSelector = useMemo(() => (state) => {
    return conversationId ? state.conversations[conversationId] : null;
  }, [conversationId]); // Only re-run when conversationId changes
  const conversation = useConversationsStore(conversationSelector); // Get conversation object
  const isLoading = useConversationsStore(state => state.isLoading);
  const error = useConversationsStore(state => state.error);
  const sendMessage = useConversationsStore(state => state.sendMessage);
  const deleteMessage = useConversationsStore(state => state.deleteMessage);
  const deleteConversation = useConversationsStore(state => state.deleteConversation);
  
  // --- Derived State & Memoization ---
  const activeMessages = useMemo(() => {
    return conversation ? getActiveMessageChain(conversation) : [];
  }, [conversation]); // Depend only on conversation object reference
  const latestMessage = useMemo(() => 
    activeMessages.length > 0 ? activeMessages[activeMessages.length - 1] : null,
    [activeMessages]
  );
  const isLastMessageLoading = useMemo(() => 
    isLoading && latestMessage?.role === 'assistant',
    [isLoading, latestMessage]
  );

  // --- Handlers (useCallback) ---
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    // Use 'auto' for immediate, 'smooth' for animated
    messagesEndRef.current?.scrollIntoView({
      behavior: behavior,
      block: 'end'
    });
  }, []);

  const handleSendMessage = useCallback(async (text, images) => {
    if (!conversationId || (!text.trim() && images.length === 0)) return;
    isUserScrollingRef.current = false; // Reset scroll flag on new message
    scrollToBottom('auto'); // Scroll immediately
    await sendMessage(conversationId, text, images);
  }, [conversationId, sendMessage, scrollToBottom]);

  const handleDeleteMessage = useCallback((messageId) => {
    if (conversationId) deleteMessage(conversationId, messageId);
  }, [conversationId, deleteMessage]);

  const handleDeleteConversation = useCallback(() => {
    if (conversation && window.confirm(`Are you sure you want to delete "${conversation.title}"?`)) {
      deleteConversation(conversationId);
    }
  }, [conversation, conversationId, deleteConversation]);

  // --- Effects ---

  // Effect for scroll position tracking
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

      const { scrollTop, scrollHeight, clientHeight } = container;
      const atBottom = scrollHeight - scrollTop - clientHeight < 1;
      setIsAtBottom(atBottom);

      // Detect user scrolling UP
      scrollTimeoutRef.current = setTimeout(() => {
        // If not currently auto-scrolling AND not at the bottom, assume user scrolled up
        // Check scrollHeight > clientHeight to avoid triggering on initial load with few messages
        if (!isUserScrollingRef.current && !atBottom && scrollHeight > clientHeight + 1) {
          isUserScrollingRef.current = true;
        }
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial check

    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      container?.removeEventListener('scroll', handleScroll);
    };
  }, []); // No dependencies needed

  // Effect to detect streaming state
  useEffect(() => {
    const streaming = isLastMessageLoading &&
                      latestMessage?.content &&
                      (typeof latestMessage.content === 'string' ? latestMessage.content.length > 0 : true);
    setIsStreaming(streaming);
  }, [isLastMessageLoading, latestMessage?.content]);

  // *** Consolidated Auto-Scroll Effect ***
  useEffect(() => {
    const justFinishedLoading = wasLoadingRef.current && !isLoading;

    if (justFinishedLoading) {
      // If loading just finished, always scroll to bottom and reset user scroll flag
      isUserScrollingRef.current = false;
      scrollToBottom('smooth'); // Smooth scroll to the final position
    } else if (isStreaming && !isUserScrollingRef.current) {
      // If actively streaming and user hasn't scrolled up, scroll smoothly
      // Using 'smooth' might provide a better visual during streaming
      scrollToBottom('smooth');
    }

    // Update loading ref for the next render cycle
    wasLoadingRef.current = isLoading;

  // Dependencies: Trigger when loading state changes, or when content updates during streaming
  }, [isLoading, isStreaming, latestMessage?.content, scrollToBottom]);

  // --- Render Logic ---
  const showWelcomeScreen = !conversation || activeMessages.length === 0;

  return (
    <div className="relative flex flex-col h-screen bg-background">
      {/* Chat Area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden chat-scroll-area"
      >
        <div className="min-h-full">
          {showWelcomeScreen ? (
            <div className="h-full flex items-center justify-center">
              <WelcomeScreen
                onSendMessage={handleSendMessage}
                provider={currentProvider}
                model={currentModel}
              />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 pt-6 pb-4">
              {/* --- Conversation Title --- */}
              <div className="flex justify-between items-center mb-4 sticky top-0 bg-background/80 backdrop-blur-sm py-2 z-10 -mx-4 px-4"> {/* Negative margin + padding to extend backdrop */}
                <h2 className="text-lg font-medium truncate flex-1 mr-2">{conversation.title}</h2>
                <button
                  onClick={handleDeleteConversation}
                  className="text-muted-foreground hover:text-destructive p-1 rounded-md flex-shrink-0"
                  aria-label="Delete conversation"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Messages List */}
              {activeMessages.map((message) => {
                const messageNode = conversation?.messages?.[message.id];
                const currentVersionIndex = messageNode?.versions.findIndex(v => v.id === message.versionId) ?? -1;
                const totalVersions = messageNode?.versions.length ?? 0;

                return (
                  <ChatMessage
                    key={`${message.id}-${message.versionId}`}
                    message={message}
                    currentVersionIndex={currentVersionIndex}
                    totalVersions={totalVersions}
                    canGoPrev={currentVersionIndex > 0}
                    canGoNext={currentVersionIndex < totalVersions - 1}
                    isLoading={isLoading && message.id === latestMessage?.id}
                    onDeleteMessage={handleDeleteMessage}
                  />
                );
              })}

              {/* Error Display */}
              {error && (
                <div className="chat-error-message">
                  Error: {error}
                </div>
              )}

              {/* Scroll Anchor */}
              <div ref={messagesEndRef} className="h-1" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>

      {/* Scroll to Bottom Button */}
      {!isAtBottom && !showWelcomeScreen && (
        <button
          onClick={() => {
             isUserScrollingRef.current = false; // Allow auto-scroll again
             scrollToBottom('smooth'); // Use smooth scroll
          }}
          className="scroll-to-bottom-button"
          aria-label="Scroll to bottom"
        >
          <ArrowDown size={16} />
        </button>
      )}

      {/* Input Area with Gradient */}
      <div className="input-area-gradient">
        <div className="max-w-3xl mx-auto px-4">
          <MessageInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            isStreaming={isStreaming}
            disabled={isLoading}
          />
          <p className="input-footer-text">
            ChatGPT Clone can make mistakes. Consider checking important information.
          </p>
        </div>
      </div>
    </div>
  );
}