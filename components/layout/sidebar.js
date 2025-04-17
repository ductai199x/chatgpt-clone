'use client';

import { useEffect, useState } from 'react';
import { Plus, Settings, MessageSquare, Trash2, ChevronLeft, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useConversationsStore } from '@/lib/store/conversations-store';
import { formatDate } from '@/lib/utils';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function Sidebar({ open, onClose, onNewChat, onSettingsOpen }) {
  const { conversations, activeConversationId, setActiveConversation, deleteConversation, clearAllConversations } = useConversationsStore();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  // Close the sidebar when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (open) {
        // Check if the click is outside the sidebar
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.contains(e.target)) {
          onClose();
        }
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);
  
  // Close the sidebar when pressing ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (open && e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);
  
  return (
    <>
      {/* Sidebar backdrop for mobile */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-all duration-100',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        aria-hidden="true"
      />
      
      {/* Trigger zone for hover on desktop */}
      {!isMobile && !open && (
        <div 
          className="fixed top-0 left-0 w-4 h-full z-40 hidden md:block"
          onMouseEnter={() => onClose(true)}
        />
      )}
      
      {/* Floating button to open sidebar */}
      {!open && (
        <button
          onClick={() => onClose(true)}
          className="fixed top-4 left-4 z-50 p-2 rounded-md bg-background border border-border shadow-md hover:bg-accent transition-all duration-200"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
      
      {/* Sidebar */}
      <aside
        id="sidebar"
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 bg-dark dark:bg-sidebar transition-transform duration-200 ease-in-out flex flex-col',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between p-3 border-b border-border/50">
          <h2 className="text-sm font-medium">ChatGPT Clone</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onClose(false)}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Close sidebar</span>
          </Button>
        </div>
        
        {/* New chat button */}
        <div className="p-2">
          <Button
            variant="outline"
            className="w-full justify-start text-sm flex gap-3"
            onClick={onNewChat}
          >
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>
        
        {/* Conversation list */}
        <nav className="flex-1 overflow-y-auto p-2">
          <h2 className="text-xs font-semibold text-muted-foreground mb-2">
            Recent conversations
          </h2>
          
          <ul className="space-y-1">
            {Object.entries(conversations).length > 0 ? (
              Object.entries(conversations)
                .sort(([, a], [, b]) => new Date(b.updatedAt) - new Date(a.updatedAt))
                .map(([id, conversation]) => (
                  <li key={id}>
                    <div className="flex group items-center">
                      <Button
                        variant="ghost"
                        className={cn(
                          'w-full justify-start text-sm flex gap-2 overflow-hidden h-auto py-3',
                          id === activeConversationId && 'bg-accent'
                        )}
                        onClick={() => {
                          setActiveConversation(id);
                          if (window.innerWidth < 768) {
                            onClose();
                          }
                        }}
                      >
                        <MessageSquare className="h-4 w-4 shrink-0" />
                        <div className="truncate flex-1 text-left">
                          <span className="block truncate">{conversation.title}</span>
                          <span className="text-xs text-muted-foreground block truncate">
                            {formatDate(conversation.updatedAt)}
                          </span>
                        </div>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 p-0 ml-1 opacity-50 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(id);
                        }}
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))
            ) : (
              <li className="text-sm text-muted-foreground px-2">
                No recent conversations
              </li>
            )}
          </ul>
        </nav>
        
        {/* Sidebar footer */}
        <div className="p-2 border-t border-border/50 flex flex-col gap-2">
          <Button
            variant="ghost"
            className="w-full justify-start text-sm"
            onClick={() => setConfirmClearOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear conversations
          </Button>
          
          <Button
            variant="ghost"
            className="w-full justify-start text-sm"
            onClick={onSettingsOpen}
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
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