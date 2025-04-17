'use client';

import { Button } from '@/components/ui/button';
import { Plus, Menu } from 'lucide-react'; // Removed Settings
import { useConversationsStore } from '@/lib/store/conversations-store';
import { cn } from '@/lib/utils'; // Import cn

export function MobileHeader({ onMenuClick, onNewChat }) { // Removed onSettingsClick
  const { activeConversationId, conversations } = useConversationsStore();

  // Get active conversation title
  const conversationTitle = activeConversationId
    ? conversations[activeConversationId]?.title || 'New chat'
    : 'New chat';

  return (
    // Use the new class
    <header className="mobile-header">
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
        // Use the new class
        className="mobile-header-button"
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Menu</span>
      </Button>

      {/* Use the new class */}
      <h1 className="mobile-header-title">
        {conversationTitle}
      </h1>

      {/* Only New Chat button remains */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onNewChat}
        // Use the new class
        className="mobile-header-button"
      >
        <Plus className="h-5 w-5" />
        <span className="sr-only">New chat</span>
      </Button>
    </header>
  );
}