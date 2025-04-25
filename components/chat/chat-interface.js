'use client';

// --- Imports ---
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { useSettingsStore } from '@/lib/store/settings-store';
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
  
  // Get conversation, loading state, error, and actions from useChatStore
  const conversation = useChatStore(state => state.conversations[conversationId]);
  const isLoading = useChatStore(state => state.isLoading);
  const error = useChatStore(state => state.error);
  const sendMessage = useChatStore(state => state.sendMessage);
  const deleteMessageBranch = useChatStore(state => state.deleteMessageBranch);
  const deleteConversation = useChatStore(state => state.deleteConversation);
  const getMessageChain = useChatStore(state => state.getMessageChain); // Get the selector function
  
  // --- Derived State & Memoization ---
  const activeMessages = useMemo(() => {
    // --- UPDATE: Use the selector from the store ---
    return conversationId ? getMessageChain(conversationId) : [];
  }, [conversationId, getMessageChain, conversation]); // Re-run if conversation object changes (structure might update)

  const latestMessage = useMemo(() =>
    activeMessages.length > 0 ? activeMessages[activeMessages.length - 1] : null,
    [activeMessages]
  );

  // --- UPDATE: Check if the latest message is incomplete ---
  const isLastMessageLoadingOrIncomplete = useMemo(() =>
    isLoading || (latestMessage?.role === 'assistant' && latestMessage?.isIncomplete),
    [isLoading, latestMessage]
  );

  // --- Handlers (useCallback) ---
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior: behavior, block: 'end' });
  }, []);

  const handleSendMessage = useCallback(async (text, images = [], referencedNodeIds = []) => { // Add references if needed by input
    if (!conversationId || (!text.trim() && images.length === 0)) return;
    const content = images.length > 0
      // --- CORRECTED LOGIC ---
      // 'images' is an array of data URI strings from MessageInput
      ? [
          { type: 'text', text: text.trim() }, // Ensure text is trimmed
          // Map each data URI string (img) to the expected object structure
          ...images.map(imgDataUrl => ({ type: 'image_url', imageUrl: imgDataUrl }))
        ]
      // --- END CORRECTION ---
      : text.trim(); // Also trim text if no images
    isUserScrollingRef.current = false;
    scrollToBottom('auto');
    // --- UPDATE: Pass references if collected ---
    await sendMessage(conversationId, content, referencedNodeIds);
  }, [conversationId, sendMessage, scrollToBottom]);

  const handleDeleteMessageBranch = useCallback((messageId) => {
    // --- UPDATE: Use deleteMessageBranch ---
    if (conversationId) deleteMessageBranch(conversationId, messageId);
  }, [conversationId, deleteMessageBranch]);

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

  // Effect to detect streaming state (check isLoading only)
  useEffect(() => {
    // Streaming is true if the store reports loading AND the last message is an assistant
    const streaming = isLoading && latestMessage?.role === 'assistant';
    setIsStreaming(streaming);
  }, [isLoading, latestMessage]);

  // Consolidated Auto-Scroll Effect 
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

  // --- Helper to find parent ID ---
  const findParentId = useCallback((messageId) => {
    if (!conversation) return null;
    for (const id in conversation.message_nodes) {
      const node = conversation.message_nodes[id];
      if (node.nextMessageId === messageId || node.childrenMessageIds?.includes(messageId)) {
        return id;
      }
    }
    return null;
  }, [conversation]);

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
                // --- UPDATE: Get parent and children info for branching UI ---
                const parentId = findParentId(message.id);
                const parentNode = parentId ? conversation?.message_nodes[parentId] : null;
                const childrenIds = parentNode?.childrenMessageIds || [];
                const currentBranchIndex = childrenIds.indexOf(message.id); // Index among siblings
                const totalBranches = childrenIds.length;

                return (
                  <ChatMessage
                    key={message.id} // Use message ID as key
                    message={message}
                    // --- UPDATE: Pass branching info ---
                    parentId={parentId}
                    currentBranchIndex={currentBranchIndex}
                    totalBranches={totalBranches}
                    childrenIds={childrenIds}
                    // --- UPDATE: Pass loading/incomplete status ---
                    isLoading={isLoading && message.id === latestMessage?.id}
                    isIncomplete={message.isIncomplete}
                    // --- UPDATE: Pass correct delete action ---
                    onDeleteMessageBranch={handleDeleteMessageBranch}
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
            // --- UPDATE: Pass combined loading/incomplete status ---
            isLoading={isLastMessageLoadingOrIncomplete}
            isStreaming={isStreaming} // Keep isStreaming for input visual cues if needed
            disabled={isLoading} // Disable input only during actual API calls
          />
          <p className="input-footer-text">
            ChatGPT Clone can make mistakes. Consider checking important information.
          </p>
        </div>
      </div>
    </div>
  );
}