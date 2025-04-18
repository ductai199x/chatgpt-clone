'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import ArtifactSidebar from '@/components/artifacts/artifact-sidebar';
import ChatInterface from '@/components/chat/chat-interface';
import { MobileHeader } from '@/components/layout/mobile-header';
import { generateNewConversation } from '@/lib/utils/conversation';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { UserSettings } from '@/components/settings/user-settings';
import { useSettingsStore } from '@/lib/store/settings-store';
import { useConversationsStore } from '@/lib/store/conversations-store';
import { useUIStore } from '@/lib/store/ui-store';
import { cn } from '@/lib/utils';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { loadSettings } = useSettingsStore();
  const { conversations, activeConversationId, setActiveConversation, addConversation, loadConversations } = useConversationsStore();

  const isArtifactSidebarOpen = useUIStore(state => state.isArtifactSidebarOpen);

  // Load settings and conversations from local storage on mount
  useEffect(() => {
    loadSettings();
    loadConversations();
  }, [loadSettings, loadConversations]);

  // Keep sidebar closed on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  // Handle starting a new chat
  const handleNewChat = () => {
    const newConversation = generateNewConversation();
    addConversation(newConversation);
    setActiveConversation(newConversation.id);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  // --- Define the width for the artifact sidebar (adjust as needed) ---
  // Using a CSS variable allows easier reuse in both components
  const artifactSidebarWidth = 'md:w-[45%]'; // e.g., 45% on medium screens and up

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
      <main className={cn(
        "flex-1 flex flex-col overflow-hidden",
        // --- Add transition for margin change ---
        "transition-[margin-right] duration-300 ease-in-out",
        // --- Apply right margin when artifact sidebar is open on desktop ---
        isArtifactSidebarOpen && !isMobile ? 'mr-[45%]' : 'mr-0' // Match the sidebar width percentage
        // Note: Using fixed percentage here. If sidebar width is dynamic,
        // you might need JS to calculate margin or use CSS variables.
      )}>
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

      {/* Artifact Sidebar (Right) - Render it here */}
      <ArtifactSidebar widthClass={artifactSidebarWidth} />

      {/* Settings dialog */}
      <UserSettings 
        open={settingsOpen} 
        onClose={() => setSettingsOpen(false)} 
      />
    </div>
  );
}