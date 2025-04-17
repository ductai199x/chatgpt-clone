'use client';

import { Button } from '@/components/ui/button';
import { Plus, Menu, Settings } from 'lucide-react';
import { useConversationsStore } from '@/lib/store/conversations-store';

export function MobileHeader({ onMenuClick, onNewChat, onSettingsClick }) {
  const { activeConversationId, conversations } = useConversationsStore();
  
  // Get active conversation title
  const conversationTitle = activeConversationId 
    ? conversations[activeConversationId]?.title || 'New chat'
    : 'New chat';
  
  return (
    <header className="flex items-center justify-between p-2 border-b border-border md:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Menu</span>
      </Button>
      
      <h1 className="text-sm font-medium truncate max-w-[200px]">
        {conversationTitle}
      </h1>
      
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onNewChat}
        >
          <Plus className="h-5 w-5" />
          <span className="sr-only">New chat</span>
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettingsClick}
        >
          <Settings className="h-5 w-5" />
          <span className="sr-only">Settings</span>
        </Button>
      </div>
    </header>
  );
}