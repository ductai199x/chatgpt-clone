'use client';

import { useEffect, useState, useRef } from 'react';
import { Plus, Settings, MessageSquare, Trash2, ChevronLeft, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/lib/store/chat-store';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// --- Simple Date Formatter ---
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
// --- End Formatter ---

export function Sidebar({ open, onClose, onNewChat, onSettingsOpen, conversations, activeConversationId, setActiveConversation }) {
  // --- UPDATE: Use selector from useChatStore for actions ---
  // Note: conversations, activeConversationId, setActiveConversation are passed as props from page.js now
  const deleteConversation = useChatStore(state => state.deleteConversation);
  const clearAllConversations = useChatStore(state => state.clearAllConversations);


  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const sidebarRef = useRef(null);
  const openButtonRef = useRef(null);

  // Close sidebar on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        open &&
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target)
      ) {
        const mobileOpenButton = document.getElementById('sidebar-open-button');
        if (!isMobile || !mobileOpenButton || !mobileOpenButton.contains(e.target)) {
          onClose(false);
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
    setActiveConversation(id); // Use prop
    if (isMobile) {
      onClose(false);
    }
  };

  return (
    <>
      {/* Sidebar backdrop for mobile */}
      {isMobile && (
        <div
          className={cn(
            'sidebar-backdrop',
            open ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          onClick={() => onClose(false)}
          aria-hidden="true"
        />
      )}

      {/* Floating button to open sidebar (Mobile only) */}
      {!open && isMobile && (
        <button
          id="sidebar-open-button"
          ref={openButtonRef}
          onClick={() => onClose(true)}
          className="sidebar-open-button"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Desktop Hover Trigger Area */}
      {!open && !isMobile && (
        <div
          className="sidebar-desktop-trigger"
          onMouseEnter={() => onClose(true)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        id="sidebar"
        ref={sidebarRef}
        className={cn(
          'sidebar',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Sidebar header */}
        <div className="sidebar-header">
          {/* Close button (only shown when sidebar is open) */}
          {open && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onClose(false)}
              className="sidebar-close-button"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="sr-only">Close sidebar</span>
            </Button>
          )}

          {/* New chat button (only shown when sidebar is open) */}
          {open && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onNewChat}
              className="sidebar-new-chat-button-header"
            >
              <Plus className="h-5 w-5" />
              <span className="sr-only">New chat</span>
            </Button>
          )}
        </div>

        {/* Conversation list (only shown when sidebar is open) */}
        {open && (
          <nav className="sidebar-nav">
            <ul>
              {Object.entries(conversations).length > 0 ? (
                Object.entries(conversations)
                  .sort(([, a], [, b]) => new Date(b.updatedAt) - new Date(a.updatedAt))
                  .map(([id, conversation]) => (
                    <li key={id}>
                      <div className="sidebar-item-container group">
                        <Button
                          variant="ghost"
                          className={cn(
                            'sidebar-item-button',
                            id === activeConversationId && 'active'
                          )}
                          onClick={() => handleConversationClick(id)}
                        >
                          <div className="sidebar-item-title-row">
                            <MessageSquare className="h-4 w-4 shrink-0 mr-2" />
                            <span className="sidebar-item-title">
                              {conversation.title}
                            </span>
                          </div>
                          <span className="sidebar-item-date">
                            {formatRelativeDate(conversation.updatedAt)}
                          </span>
                        </Button>
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
                <li className="sidebar-empty-list">
                  No conversations yet
                </li>
              )}
            </ul>
          </nav>
        )}

        {/* Sidebar footer (only shown when sidebar is open) */}
        {open && (
          <div className="sidebar-footer">
            <Button
              variant="ghost"
              className="sidebar-footer-button"
              onClick={() => setConfirmClearOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear conversations
            </Button>

            <Button
              variant="ghost"
              className="sidebar-footer-button"
              onClick={onSettingsOpen}
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        )}
      </aside>

      {/* Confirm clear dialog */}
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