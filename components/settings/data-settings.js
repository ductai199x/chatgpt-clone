'use client';

import { useState, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Upload, Trash2 } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

export default function DataSettings({ onClose }) {
  const activeConversationId = useChatStore(state => state.activeConversationId);
  const getConversation = useChatStore(state => state.getConversation);
  const clearAllConversations = useChatStore(state => state.clearAllConversations);

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  // Handle exporting all conversations
  const handleExportAll = () => {
    try {
      // Get the current state directly for export
      const currentState = useChatStore.getState();
      const exportData = {
        version: '1.0-chat', // Indicate new format version
        conversations: currentState.conversations, // Export the conversations object
        exportedAt: new Date().toISOString(),
      };
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chatgpt-clone-export-all-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: 'Export successful', description: 'All conversations exported.' });
    } catch (error) {
      console.error('Export failed:', error);
      toast({ title: 'Export failed', description: error.message || 'An error occurred.', variant: 'destructive' });
    }
  };

  // Handle exporting current conversation
  const handleExportCurrent = () => {
    if (!activeConversationId) {
      toast({ title: 'Export failed', description: 'No active conversation.', variant: 'destructive' });
      return;
    }
    try {
      // Use getConversation to retrieve the specific conversation data
      const conversationData = getConversation(activeConversationId);
      if (!conversationData) throw new Error('Could not find active conversation.');

      // Wrap the single conversation in the expected export structure
      const exportData = {
        version: '1.0-chat',
        conversations: {
          [activeConversationId]: conversationData
        },
        exportedAt: new Date().toISOString(),
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use conversation title for filename if available
      const filenameBase = conversationData.title ? conversationData.title.replace(/\s+/g, '-').toLowerCase() : activeConversationId;
      a.download = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: 'Export successful', description: 'Current conversation exported.' });
    } catch (error) {
      console.error('Export failed:', error);
      toast({ title: 'Export failed', description: error.message || 'An error occurred.', variant: 'destructive' });
    }
  };

  // Handle file selection for import
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importData = JSON.parse(event.target.result);
        let importedCount = 0;

        // Check for the new expected format
        if (importData.conversations && typeof importData.conversations === 'object') {
          const conversationsToImport = importData.conversations;
          // --- Use set directly to merge imported conversations ---
          useChatStore.setState(state => {
            for (const [id, conversation] of Object.entries(conversationsToImport)) {
              // Basic validation (can be expanded)
              if (conversation && conversation.id === id && conversation.message_nodes && conversation.artifact_nodes) {
                state.conversations[id] = conversation; // Overwrite or add
                importedCount++;
              } else {
                console.warn(`Skipping invalid conversation structure during import: ID ${id}`);
              }
            }
            // Optionally set the active conversation if none is active
            if (!state.activeConversationId && importedCount > 0) {
              state.activeConversationId = Object.keys(conversationsToImport)[0];
            }
          });

        } else {
          throw new Error('Invalid or unsupported file format.');
        }

        if (importedCount > 0) {
          toast({ title: 'Import successful', description: `Imported ${importedCount} conversation(s).` });
        } else {
          throw new Error('No valid conversations found in the file.');
        }
      } catch (error) {
        console.error('Import failed:', error);
        toast({ title: 'Import failed', description: error.message || 'Invalid format or structure.', variant: 'destructive' });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
        setImportDialogOpen(false);
      }
    };
    reader.onerror = () => {
      toast({ title: 'Import failed', description: 'Error reading file.', variant: 'destructive' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      setImportDialogOpen(false);
    };
    reader.readAsText(file);
  };

  // Handle clearing all conversations (uses clearAllConversations from the store)
  const handleClearAll = () => {
    clearAllConversations();
    setConfirmClearOpen(false);
    toast({ title: 'Conversations cleared', description: 'All conversations deleted.' });
    onClose(); // Close settings dialog
  };

  return (
    <>
      {/* Import/Export section */}
      <div className="settings-section"> {/* Use settings-section */}
        <h3 className="settings-section-header">Import / Export</h3> {/* Use section header class */}

        {/* Export options */}
        <div className="settings-item"> {/* Use settings-item */}
          <Label>Export conversations</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={handleExportAll}
            >
              <Download className="h-4 w-4" />
              Export all
            </Button>

            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={handleExportCurrent}
              disabled={!activeConversationId}
            >
              <Download className="h-4 w-4" />
              Export current
            </Button>
          </div>
          <p className="settings-item-description"> {/* Use description class */}
            Download your conversation history as JSON files.
          </p>
        </div>

        {/* Import dialog trigger */}
        <div className="settings-item"> {/* Use settings-item */}
          <Label>Import conversations</Label>
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 w-full sm:w-auto">
                <Upload className="h-4 w-4" />
                Import from file...
              </Button>
            </DialogTrigger>
            {/* Import Dialog Content */}
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Conversations</DialogTitle>
                <DialogDescription>
                  Select a JSON file to import conversations.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <p className="text-sm text-muted-foreground">
                  Select a JSON file previously exported from this application.
                </p>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                />
                <p className="text-xs text-muted-foreground"> {/* Smaller text */}
                  <strong>Note:</strong> Importing may overwrite conversations with the same ID.
                </p>
              </div>
            </DialogContent>
          </Dialog>
          <p className="settings-item-description"> {/* Use description class */}
            Upload a previously exported JSON file.
          </p>
        </div>
      </div>

      {/* Data management section */}
      <div className="settings-section border-destructive/50"> {/* Use settings-section, add destructive border */}
        <h3 className="settings-section-header text-destructive">Data Management</h3> {/* Use section header class, add destructive text */}

        {/* Clear data */}
        <div className="settings-item"> {/* Use settings-item */}
          <Label>Clear conversation data</Label>
          <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="flex items-center gap-2 w-full sm:w-auto">
                <Trash2 className="h-4 w-4" />
                Clear all conversations...
              </Button>
            </DialogTrigger>
            {/* Clear Confirmation Dialog Content */}
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear all conversations?</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete all conversations? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-muted-foreground py-4">
                This will permanently delete all your conversation history from this browser. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setConfirmClearOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleClearAll}
                >
                  Clear all
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <p className="settings-item-description"> {/* Use description class */}
            Delete all conversation history from your device.
          </p>
        </div>

        {/* Local storage info */}
        <div className="rounded-md bg-muted p-3 mt-4"> {/* Reduced padding */}
          <p className="text-xs text-muted-foreground"> {/* Smaller text */}
            <strong>Privacy Note:</strong> All data is stored locally in your browser.
            No conversation data is sent to or stored on our servers.
          </p>
        </div>
      </div>
    </>
  );
}