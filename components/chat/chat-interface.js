'use client';

import { useEffect, useRef, useState } from 'react';
import { useConversationsStore } from '@/lib/store/conversations-store';
import { useSettingsStore } from '@/lib/store/settings-store';
import ChatMessage from './chat-message';
import MessageInput from './message-input';
import WelcomeScreen from './welcome-screen';

export default function ChatInterface({ conversationId }) {
  const { conversations, isLoading, error, sendMessage, deleteMessage, deleteConversation } = useConversationsStore();
  const { currentProvider, currentModel } = useSettingsStore();
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const prevMessageLengthRef = useRef(0);
  const prevResponseContentRef = useRef(''); // Track the last assistant message content
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false); // Track streaming state
  
  const conversation = conversationId 
    ? conversations[conversationId]
    : null;
  
  const messages = conversation?.messages || [];
  
  // Get the latest assistant message (for streaming tracking)
  const latestAssistantMessage = messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' 
    ? messages[messages.length - 1] 
    : null;
  
  // Handle scrolling and scroll position tracking
  useEffect(() => {
    const handleScroll = () => {
      if (!chatContainerRef.current) return;
      
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      // Consider "at bottom" if within 100px of the bottom
      const atBottom = scrollHeight - scrollTop - clientHeight < 100;
      setIsAtBottom(atBottom);
    };
    
    // Add scroll event listener
    const container = chatContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);
  
  // Handle scroll to bottom when messages change
  useEffect(() => {
    // Only scroll when new messages are added
    if (messages.length > prevMessageLengthRef.current && messagesEndRef.current) {
      // Wait for content to render
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        setIsAtBottom(true);
      }, 100);
    }
    
    // Update the ref for next comparison
    prevMessageLengthRef.current = messages.length;
  }, [messages]);
  
  // Handle scrolling during streaming
  useEffect(() => {
    if (!latestAssistantMessage || !isLoading) return;
    
    // Get the content of the latest message
    const currentContent = typeof latestAssistantMessage.content === 'string' 
      ? latestAssistantMessage.content 
      : '';
    
    // If content changed and we're at the bottom, keep scrolling
    if (currentContent !== prevResponseContentRef.current && isAtBottom) {
      // Small delay to allow content to render
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      }, 10);
    }
    
    // Update our ref with the latest content
    prevResponseContentRef.current = currentContent;
  }, [latestAssistantMessage, isLoading, isAtBottom]);
  
  // This effect detects when streaming is happening
  useEffect(() => {
    // We're streaming if:
    // 1. The app is in a loading state
    // 2. The last message is from the assistant
    // 3. The message has some content (streaming has started)
    const streaming = isLoading && 
                      latestAssistantMessage?.role === 'assistant' &&
                      latestAssistantMessage?.content && 
                      typeof latestAssistantMessage.content === 'string' && 
                      latestAssistantMessage.content.length > 0;
    
    setIsStreaming(streaming);
  }, [isLoading, latestAssistantMessage]);
  
  // This effect handles the smooth scrolling during streaming
  useEffect(() => {
    // Only run this effect if we're streaming and user is at the bottom
    if (!isStreaming || !isAtBottom) return;
    
    let scrollAnimationId;
    
    // This function will be called repeatedly at the browser's refresh rate
    const smoothScrollUpdate = () => {
      if (messagesEndRef.current && isStreaming && isAtBottom) {
        // Scroll to bottom with each frame update - instant (not smooth) for better performance
        messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
        
        // Request the next animation frame if we're still streaming
        scrollAnimationId = requestAnimationFrame(smoothScrollUpdate);
      }
    };
    
    // Start the animation loop
    scrollAnimationId = requestAnimationFrame(smoothScrollUpdate);
    
    // Clean up when the effect ends
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
    
    // Reset the response content tracker before sending a new message
    prevResponseContentRef.current = '';
    
    // Ensure we're at the bottom when sending a new message
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
      {/* Fixed height scrollable container */}
      <div 
        ref={chatContainerRef}
        className="absolute inset-0 bottom-24 overflow-y-auto overflow-x-hidden"
      >
        <div className="min-h-full">
          {!conversation || messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <WelcomeScreen
                onSendMessage={handleSendMessage}
                provider={currentProvider}
                model={currentModel}
              />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-6 px-4 pb-20">
              {/* Conversation header with title and delete button */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-medium">{conversation.title}</h2>
                <button
                  onClick={() => deleteConversation(conversationId)}
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
              
              {messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isLoading={isLoading && message.id === messages[messages.length - 1]?.id && message.role === 'assistant'}
                  onDeleteMessage={handleDeleteMessage}
                />
              ))}
              
              {/* Error message */}
              {error && (
                <div className="text-destructive text-sm p-4 rounded-md bg-destructive/10 mb-4">
                  {error}
                </div>
              )}
              
              {/* Scroll anchor - with extra padding to prevent scrolling past bottom */}
              <div ref={messagesEndRef} className="h-12" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
      
      {/* Scroll to bottom button - shows only when not at bottom */}
      {!isAtBottom && messages.length > 0 && (
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
      
      {/* Fixed position input bar */}
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