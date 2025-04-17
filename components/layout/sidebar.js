'use client';

import { useEffect, useState } from 'react';
import { Plus, Settings, MessageSquare, Trash2, ChevronLeft, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useConversationsStore } from '@/lib/store/conversations-store';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// --- Simple Date Formatter (or import your preferred one) ---
function formatRelativeDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffTime / (1000 * 60));

  if (diffDays === 0) {
    if (diffHours < 1) {
      if (diffMinutes < 1) return "Just now";
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    }
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays <= 7) {
    return `${diffDays} days ago`;
  } else {
    // Simple date format for older dates
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
// --- End Formatter ---

export function Sidebar({ open, onClose, onNewChat, onSettingsOpen }) {
  const { conversations, activeConversationId, setActiveConversation, deleteConversation, clearAllConversations } = useConversationsStore();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Close sidebar on outside click (Mobile only)
  useEffect(() => {
    if (!isMobile) return; // Only run on mobile

    const handleClickOutside = (e) => {
      const sidebar = document.getElementById('sidebar');
      // Check if sidebar is open and click is outside
      if (open && sidebar && !sidebar.contains(e.target)) {
        // Also check if the click wasn't on the open button itself
        const openButton = document.getElementById('sidebar-open-button');
        if (!openButton || !openButton.contains(e.target)) {
          onClose(false); // Close sidebar
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose, isMobile]);

  // Close sidebar on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (open && e.key === 'Escape') {
        onClose(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleConversationClick = (id) => {
    setActiveConversation(id);
    if (isMobile) {
      onClose(false); // Close sidebar on mobile after selection
    }
  };

  return (
    <>
      {/* Sidebar backdrop for mobile */}
      <div
        className={cn(
          'sidebar-backdrop', // Use new class
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => onClose(false)} // Close on backdrop click
        aria-hidden="true"
      />

      {/* Floating button to open sidebar (Mobile only) */}
      {!open && isMobile && (
        <button
          id="sidebar-open-button"
          onClick={() => onClose(true)} // Open sidebar
          className="sidebar-open-button" // Use new class
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Sidebar */}
      <aside
        id="sidebar"
        className={cn(
          'sidebar', // Use new class
          // Adjust translate based on open state for both mobile and desktop
          open ? 'translate-x-0' : '-translate-x-full',
          // Ensure it's visible on desktop when open
          'md:translate-x-0',
          // Hide completely on desktop when closed
          !open && 'md:-translate-x-full'
        )}
      >
        {/* Sidebar header */}
        <div className="sidebar-header">
          {/* Close button (acts as toggle on desktop) */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onClose(!open)} // Toggle open state
            className="sidebar-close-button" // Use new class
          >
            {/* Show Menu icon when closed on desktop, ChevronLeft otherwise */}
            {!isMobile && !open ? <Menu className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            <span className="sr-only">{open ? 'Close sidebar' : 'Open sidebar'}</span>
          </Button>

          {/* New chat button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewChat}
            className="sidebar-new-chat-button-header" // Use new class
          >
            <Plus className="h-5 w-5" />
            <span className="sr-only">New chat</span>
          </Button>
        </div>

        {/* Conversation list */}
        <nav className="sidebar-nav">
          {/* Removed "Recent conversations" heading */}
          <ul>
            {Object.entries(conversations).length > 0 ? (
              Object.entries(conversations)
                .sort(([, a], [, b]) => new Date(b.updatedAt) - new Date(a.updatedAt))
                .map(([id, conversation]) => (
                  <li key={id}>
                    {/* Use container for group hover */}
                    <div className="sidebar-item-container group">
                      <Button
                        variant="ghost"
                        className={cn(
                          'sidebar-item-button',
                          id === activeConversationId && 'active'
                        )}
                        onClick={() => handleConversationClick(id)}
                      >
                        {/* Row for Icon and Title */}
                        <div className="sidebar-item-title-row">
                          <MessageSquare className="h-4 w-4 shrink-0 mr-2" />
                          <span className="sidebar-item-title">
                            {conversation.title}
                          </span>
                        </div>
                        {/* Date below the title row */}
                        <span className="sidebar-item-date"> {/* pl-6 added via CSS */}
                          {formatRelativeDate(conversation.updatedAt)}
                        </span>
                      </Button>
                      {/* Actions container shown on group hover */}
                      <div className="sidebar-item-actions group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="sidebar-item-delete-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(id);
                          }}
                          aria-label="Delete conversation"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))
            ) : (
              <li className="sidebar-empty-list"> {/* Use new class */}
                No conversations yet
              </li>
            )}
          </ul>
        </nav>

        {/* Sidebar footer */}
        <div className="sidebar-footer">
          <Button
            variant="ghost"
            className="sidebar-footer-button" // Use new class
            onClick={() => setConfirmClearOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear conversations
          </Button>

          <Button
            variant="ghost"
            className="sidebar-footer-button" // Use new class
            onClick={onSettingsOpen}
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </aside>

      {/* Confirm clear dialog (no style changes needed here) */}
      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all conversations?</DialogTitle>
            <DialogDescription>
              This will permanently delete all your conversation history. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmClearOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearAllConversations();
                setConfirmClearOpen(false);
              }}
            >
              Clear all
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}