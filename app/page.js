'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import ChatInterface from '@/components/chat/chat-interface';
import { MobileHeader } from '@/components/layout/mobile-header';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { generateNewConversation } from '@/lib/utils/conversation';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { UserSettings } from '@/components/settings/user-settings';
import { useSettingsStore } from '@/lib/store/settings-store';
import { useConversationsStore } from '@/lib/store/conversations-store';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { loadSettings } = useSettingsStore();
  const { conversations, activeConversationId, setActiveConversation, addConversation, loadConversations } = useConversationsStore();

  // Load settings and conversations from local storage on mount
  useEffect(() => {
    loadSettings();
    loadConversations();
  }, [loadSettings, loadConversations]);

  // Keep sidebar closed by default on all devices
  // useEffect(() => {
  //   setSidebarOpen(false);
  // }, []);

  // Handle starting a new chat
  const handleNewChat = () => {
    const newConversation = generateNewConversation();
    addConversation(newConversation);
    setActiveConversation(newConversation.id);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar component */}
      <Sidebar 
        open={sidebarOpen}
        onClose={(value) => setSidebarOpen(value !== undefined ? value : false)}
        onNewChat={handleNewChat}
        onSettingsOpen={() => setSettingsOpen(true)}
      />

      {/* Main content area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <MobileHeader 
          onMenuClick={() => setSidebarOpen(true)}
          onNewChat={handleNewChat}
          onSettingsClick={() => setSettingsOpen(true)}
        />
        <div className="flex-1 overflow-hidden">
          <ChatInterface 
            conversationId={activeConversationId}
          />
        </div>
      </main>

      {/* Settings dialog */}
      <UserSettings 
        open={settingsOpen} 
        onClose={() => setSettingsOpen(false)} 
      />
    </div>
  );
}