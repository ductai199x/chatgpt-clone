'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useConversationsStore } from '@/lib/store/conversations-store';
import { useSettingsStore } from '@/lib/store/settings-store';
import { getActiveMessageChain } from '@/lib/utils/conversation'; // Import the helper
import ChatMessage from './chat-message';
import MessageInput from './message-input';
import WelcomeScreen from './welcome-screen';

export default function ChatInterface({ conversationId }) {
  // --- LOG 1: Check if component function runs ---
  console.log(`[ChatInterface Render] ID: ${conversationId}`); 

  const { currentProvider, currentModel } = useSettingsStore();
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const prevMessageLengthRef = useRef(0);
  const prevResponseContentRef = useRef(''); 
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false); 
  
  const conversationSelector = useMemo(() => (state) => {
    // --- LOG 2: Check if selector function runs ---
    // console.log(`[ChatInterface Selector Run] ID: ${conversationId}`); 
    return conversationId ? state.conversations[conversationId] : null;
  }, [conversationId]); 
  const conversation = useConversationsStore(conversationSelector); 
  
  // --- LOG 3: Check the conversation object reference/timestamp ---
  console.log(`[ChatInterface Conversation Obj] ID: ${conversationId}, UpdatedAt: ${conversation?.updatedAt}`, conversation); 

  const isLoading = useConversationsStore(state => state.isLoading); 
  const error = useConversationsStore(state => state.error); 
  const sendMessage = useConversationsStore(state => state.sendMessage);
  const deleteMessage = useConversationsStore(state => state.deleteMessage);
  const deleteConversation = useConversationsStore(state => state.deleteConversation);
  
  // --- Use useMemo to recalculate activeMessages only when conversation changes ---
  // Depend on conversation.updatedAt as a proxy for deep changes
  const activeMessages = useMemo(() => {
    // --- LOG 4: Check if activeMessages recalculates ---
    console.log(`[ChatInterface Recalculating activeMessages] ID: ${conversationId}, ConvUpdatedAt: ${conversation?.updatedAt}`); 
    return conversation ? getActiveMessageChain(conversation) : [];
  }, [conversation]); // Depend on the conversation object reference
  
  // --- LOG 5: Check the calculated activeMessages ---
  console.log(`[ChatInterface ActiveMessages Result] Count: ${activeMessages.length}`, activeMessages);

  // Get the latest message in the active chain
  const latestMessage = activeMessages.length > 0 ? activeMessages[activeMessages.length - 1] : null;
  
  // --- Modified: Determine if the *last* message is loading/streaming ---
  const isLastMessageLoading = isLoading && latestMessage?.role === 'assistant';
  
  // Handle scrolling and scroll position tracking
  useEffect(() => {
    const handleScroll = () => {
      if (!chatContainerRef.current) return;
      
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const atBottom = scrollHeight - scrollTop - clientHeight < 100;
      setIsAtBottom(atBottom);
    };
    
    const container = chatContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);
  
  // Handle scroll to bottom when messages change
  useEffect(() => {
    if (activeMessages.length > prevMessageLengthRef.current && messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        setIsAtBottom(true);
      }, 100);
    }
    
    prevMessageLengthRef.current = activeMessages.length;
  }, [activeMessages]);
  
  // Handle scrolling during streaming (based on latestMessage)
  useEffect(() => {
    if (!isLastMessageLoading || !latestMessage) return;
    
    const currentContent = typeof latestMessage.content === 'string' 
      ? latestMessage.content 
      : '';
      
    if (currentContent !== prevResponseContentRef.current && isAtBottom) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      }, 10);
    }
    
    prevResponseContentRef.current = currentContent;
  }, [latestMessage, isLastMessageLoading, isAtBottom]);
  
  // Detect streaming state based on the last message
  useEffect(() => {
    const streaming = isLastMessageLoading &&
                      latestMessage?.content && 
                      typeof latestMessage.content === 'string' && 
                      latestMessage.content.length > 0;
    
    setIsStreaming(streaming);
  }, [isLastMessageLoading, latestMessage]);
  
  // Smooth scrolling during streaming
  useEffect(() => {
    if (!isStreaming || !isAtBottom) return;
    
    let scrollAnimationId;
    
    const smoothScrollUpdate = () => {
      if (messagesEndRef.current && isStreaming && isAtBottom) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
        scrollAnimationId = requestAnimationFrame(smoothScrollUpdate);
      }
    };
    
    scrollAnimationId = requestAnimationFrame(smoothScrollUpdate);
    
    return () => {
      if (scrollAnimationId) {
        cancelAnimationFrame(scrollAnimationId);
      }
    };
  }, [isStreaming, isAtBottom]);
  
  // Function to scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setIsAtBottom(true);
  };
  
  // Handle send message
  const handleSendMessage = async (text, images) => {
    if (!conversationId || (!text.trim() && images.length === 0)) return;
    
    prevResponseContentRef.current = '';
    setIsAtBottom(true);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }, 10);
    await sendMessage(conversationId, text, images);
  };

  // Handle message deletion
  const handleDeleteMessage = (messageId) => {
    if (conversationId) {
      deleteMessage(conversationId, messageId);
    }
  };
  
  return (
    <div className="relative flex flex-col h-screen">
      <div 
        ref={chatContainerRef}
        className="absolute inset-0 bottom-24 overflow-y-auto overflow-x-hidden"
      >
        <div className="min-h-full">
          {!conversation || activeMessages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <WelcomeScreen
                onSendMessage={handleSendMessage}
                provider={currentProvider}
                model={currentModel}
              />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-6 px-4 pb-20">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-medium">{conversation.title}</h2>
                <button
                  onClick={() => {
                     if (window.confirm(`Are you sure you want to delete "${conversation.title}"?`)) {
                       deleteConversation(conversationId);
                     }
                  }}
                  className="text-muted-foreground hover:text-destructive transition-colors p-2 rounded-md"
                  aria-label="Delete conversation"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
              
              {activeMessages.map((message) => {
                // --- Calculate version info here ---
                const messageNode = conversation?.messages?.[message.id];
                const currentVersionIndex = messageNode?.versions.findIndex(v => v.id === message.versionId) ?? -1;
                const totalVersions = messageNode?.versions.length ?? 0;
                const canGoPrev = currentVersionIndex > 0;
                const canGoNext = currentVersionIndex < totalVersions - 1;
                // --- End Calculation ---

                // --- LOG 6: Check props being passed to ChatMessage ---
                console.log(`[ChatInterface Mapping Message] ID: ${message.id}, VersionID: ${message.versionId}, Index: ${currentVersionIndex}, Total: ${totalVersions}`); 
                return (
                  <ChatMessage
                    key={`${message.id}-${message.versionId}`} 
                    message={message} // Contains id, versionId, role, content, createdAt
                    // Pass calculated version info as props
                    currentVersionIndex={currentVersionIndex}
                    totalVersions={totalVersions}
                    canGoPrev={canGoPrev}
                    canGoNext={canGoNext}
                    // --- End Pass props ---
                    isLoading={isLoading && message.id === latestMessage?.id && latestMessage?.role === 'assistant'}
                    onDeleteMessage={handleDeleteMessage} 
                  />
                );
              })}
              
              {error && (
                <div className="text-destructive text-sm p-4 rounded-md bg-destructive/10 mb-4">
                  {error}
                </div>
              )}
              
              <div ref={messagesEndRef} className="h-12" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
      
      {!isAtBottom && activeMessages.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-40 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground rounded-full p-2 shadow-md hover:bg-primary/90 transition-all"
          aria-label="Scroll to bottom"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        </button>
      )}
      
      <div className="absolute bottom-0 left-0 right-0 bg-background border-t border-border py-4">
        <div className="max-w-3xl mx-auto px-4">
          <MessageInput
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            isStreaming={isStreaming}
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  );
}