'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useChatStore } from '@/lib/store/chat-store';
import { useSettingsStore } from '@/lib/store/settings-store';
import ChatMessage from './chat-message';
import MessageInput from './message-input';
import WelcomeScreen from './welcome-screen';
import { ArrowDown, Trash2 } from 'lucide-react';
import { generateId } from '@/lib/utils';

export default function ChatInterface({ conversationId }) {
  const chatContainerRef = useRef(null);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const isAutoScrollingRef = useRef(false);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);

  const { currentProvider, currentModel } = useSettingsStore();
  const conversation = useChatStore(state => state.conversations[conversationId]);
  const isLoading = useChatStore(state => state.isLoading);
  const error = useChatStore(state => state.error);
  const sendMessage = useChatStore(state => state.sendMessage);
  const cancelMessage = useChatStore(state => state.cancelMessage);
  const addConversation = useChatStore(state => state.addConversation);
  const deleteMessageBranch = useChatStore(state => state.deleteMessageBranch);
  const deleteConversation = useChatStore(state => state.deleteConversation);
  const getMessageChain = useChatStore(state => state.getMessageChain);

  // --- Derived State & Memoization ---
  const activeMessages = useMemo(() => {
    return conversationId ? getMessageChain(conversationId) : [];
  }, [conversationId, getMessageChain, conversation]);

  const latestMessage = useMemo(() =>
    activeMessages.length > 0 ? activeMessages[activeMessages.length - 1] : null,
    [activeMessages]
  );

  const isLastMessageLoadingOrIncomplete = useMemo(() =>
    isLoading || (latestMessage?.role === 'assistant' && latestMessage?.isIncomplete),
    [isLoading, latestMessage]
  );

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const container = chatContainerRef.current;
    if (!container) return;

    // scrollHeight includes padding, clientHeight is visible area.
    // This calculation correctly targets the visual bottom before padding.
    const maxScroll = container.scrollHeight - container.clientHeight + 180;
    if (behavior === 'smooth' && Math.abs(container.scrollTop - maxScroll) < 5) {
      return; // Don't trigger smooth scroll if already there
    }

    isAutoScrollingRef.current = true;
    container.scrollTo({
      top: maxScroll,
      behavior: behavior
    });
    setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 20); // Small delay

  }, []);

  // --- Handlers (useCallback) ---
  const handleSendMessage = useCallback(async (text, images = [], referencedNodeIds = [], selectedTools = [], attachments = []) => {
    // Check if we have content to send
    if (!text.trim() && images.length === 0 && attachments.length === 0) return;
    
    // Auto-create conversation if none exists
    let targetConversationId = conversationId;
    if (!targetConversationId) {
      targetConversationId = generateId('conv');
      addConversation(targetConversationId, 'New Chat'); // Use default title, will be auto-generated later
    }
    
    // Build content array - keep images exactly as before, add attachments separately
    let content = text.trim();
    const contentParts = [];
    
    if (text.trim()) {
      contentParts.push({ type: 'text', text: text.trim() });
    }
    
    // Add images (existing functionality - unchanged)
    if (images.length > 0) {
      contentParts.push(...images.map(imgDataUrl => ({ type: 'image_url', imageUrl: imgDataUrl })));
    }
    
    // Add file attachments (new functionality)
    if (attachments.length > 0) {
      contentParts.push(...attachments.map(attachment => ({
        type: 'attachment',
        fileName: attachment.name,
        fileData: attachment.data,
        fileType: attachment.type,
        category: attachment.category
      })));
    }
    
    // Use array format if we have multiple content types, otherwise keep as string
    if (contentParts.length > 1 || images.length > 0 || attachments.length > 0) {
      content = contentParts;
    }
    
    isUserScrollingRef.current = false;
    scrollToBottom('smooth');
    await sendMessage(targetConversationId, content, referencedNodeIds);
  }, [conversationId, sendMessage, scrollToBottom, addConversation]);

  const handleCancelMessage = useCallback(() => {
    if (conversationId && cancelMessage) {
      cancelMessage(conversationId);
    }
  }, [conversationId, cancelMessage]);

  const handleDeleteMessageBranch = useCallback((messageId) => {
    if (conversationId) deleteMessageBranch(conversationId, messageId);
  }, [conversationId, deleteMessageBranch]);

  const handleDeleteConversation = useCallback(() => {
    if (conversation && window.confirm(`Are you sure you want to delete "${conversation.title}"?`)) {
      deleteConversation(conversationId);
    }
  }, [conversation, conversationId, deleteConversation]);

  // --- Effects ---
  // Effect 1: Determine if streaming is active (no changes needed)
  useEffect(() => {
    const streaming = isLoading && latestMessage?.role === 'assistant';
    setIsStreaming(streaming);
    if (streaming) {
      isUserScrollingRef.current = false;
    }
  }, [isLoading, latestMessage]);

  // Effect 2: Handle scroll events (detect user scroll, update isAtBottom)
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      const { scrollTop, scrollHeight, clientHeight } = container;
      const atBottom = scrollHeight - scrollTop - clientHeight <= 1;
      setIsAtBottom(atBottom);

      // --- Simplified User Scroll Detection ---
      if (!atBottom) {
        isUserScrollingRef.current = true;
        scrollTimeoutRef.current = setTimeout(() => {
          isUserScrollingRef.current = false;
        }, 500); // 500ms delay
      } else {
        // If we reach the bottom (naturally or via user scroll),
        // reset the user scroll flag immediately.
        isUserScrollingRef.current = false;
        // Clear any pending timeout because we've achieved the state it aims for.
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      container?.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Effect 3: Auto-scroll during streaming if user isn't scrolling
  useEffect(() => {
    let scrollInterval = null;

    if (isStreaming) {
      scrollInterval = setInterval(() => {
        if (!isUserScrollingRef.current) {
          scrollToBottom('smooth');
        }
      }, 250);
    }

    // Cleanup function
    return () => {
      if (scrollInterval) {
        clearInterval(scrollInterval);
      }
    };
  }, [isStreaming, scrollToBottom]);

  // --- Render Logic ---
  const showWelcomeScreen = !conversation || activeMessages.length === 0;

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
    <div className="chat-interface-container">
      {/* Chat Area */}
      <div
        ref={chatContainerRef}
        className="chat-area-scroll-container"
      >
        <div className="min-h-full flex flex-col">
          {showWelcomeScreen ? (
            <div className="chat-welcome-container">
              <WelcomeScreen
                onSendMessage={handleSendMessage}
                provider={currentProvider}
                model={currentModel}
              />
            </div>
          ) : (
            <div className="chat-messages-container">
              {/* --- Conversation Title --- */}
              <div className="chat-title-header">
                <h2 className="chat-title-text">{conversation.title}</h2>
                <button
                  onClick={handleDeleteConversation}
                  className="chat-title-delete-button"
                  aria-label="Delete conversation"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Messages List */}
              {activeMessages.map((message) => {
                const parentId = findParentId(message.id);
                const parentNode = parentId ? conversation?.message_nodes[parentId] : null;
                const childrenIds = parentNode?.childrenMessageIds || [];
                const currentBranchIndex = childrenIds.indexOf(message.id);
                const totalBranches = childrenIds.length;

                return (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    parentId={parentId}
                    currentBranchIndex={currentBranchIndex}
                    totalBranches={totalBranches}
                    childrenIds={childrenIds}
                    isLoading={isLoading && message.id === latestMessage?.id}
                    isIncomplete={message.isIncomplete}
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
            </div>
          )}
        </div>
      </div>

      {/* Scroll to Bottom Button - Restore */}
      {!isAtBottom && !showWelcomeScreen && (
        <button
          onClick={() => {
            isUserScrollingRef.current = false;
            if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
            scrollToBottom('smooth');
          }}
          className="scroll-to-bottom-button"
          aria-label="Scroll to bottom"
        >
          <ArrowDown size={16} />
        </button>
      )}

      {/* Input Area with Gradient */}
      <div className="input-area-gradient">
        <div className="chat-input-area-inner">
          <MessageInput
            onSendMessage={handleSendMessage}
            onCancelMessage={handleCancelMessage}
            isLoading={isLastMessageLoadingOrIncomplete}
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