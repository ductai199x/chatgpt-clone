'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import ArtifactSidebar from '@/components/artifacts/artifact-sidebar';
import ChatInterface from '@/components/chat/chat-interface';
import { MobileHeader } from '@/components/layout/mobile-header';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { UserSettings } from '@/components/settings/user-settings';
import { useSettingsStore } from '@/lib/store/settings-store';
import { useChatStore } from '@/lib/store/chat-store';
import { useUIStore } from '@/lib/store/ui-store';
import { cn, generateId } from '@/lib/utils';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { loadSettings } = useSettingsStore();

  const conversations = useChatStore(state => state.conversations);
  const activeConversationId = useChatStore(state => state.activeConversationId);
  const setActiveConversation = useChatStore(state => state.setActiveConversation);
  const addConversation = useChatStore(state => state.addConversation);

  const isArtifactSidebarOpen = useUIStore(state => state.isArtifactSidebarOpen);
  const sidebarWidth = useUIStore(state => state.sidebarWidth); // Read width from store

  // Load settings and conversations from local storage on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Keep sidebar closed on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  // Handle starting a new chat
  const handleNewChat = () => {
    const newId = generateId('conv');
    const newTitle = `New Chat ${Object.keys(conversations).length + 1}`;
    addConversation(newId, newTitle); // Use the action from the store
    setActiveConversation(newId); // Activate the new one
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
        conversations={conversations}
        activeConversationId={activeConversationId}
        setActiveConversation={setActiveConversation}
      />

      {/* Main content area */}
      <main
        className={cn(
          "flex-1 flex flex-col overflow-hidden",
          "transition-[margin-right] duration-300 ease-in-out",
        )}
        style={{
          // Apply dynamic margin-right based on store state (only on desktop)
          marginRight: isArtifactSidebarOpen && !isMobile ? `${sidebarWidth}px` : '0px',
        }}
      >
        <MobileHeader
          onMenuClick={() => setSidebarOpen(true)}
          onNewChat={handleNewChat}
          onSettingsClick={() => setSettingsOpen(true)}
        />
        {/* <div className="flex-1 overflow-hidden"> */}
        <ChatInterface
          conversationId={activeConversationId}
        />
        {/* </div> */}
      </main>

      {/* Artifact Sidebar (Right) - Render it here */}
      <ArtifactSidebar />

      {/* Settings dialog */}
      <UserSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}