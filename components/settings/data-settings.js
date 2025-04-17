'use client';

import { useState, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Upload, Trash2 } from 'lucide-react';
import { useConversationsStore } from '@/lib/store/conversations-store';
import { Dialog as ConfirmDialog, DialogContent as ConfirmDialogContent, DialogHeader as ConfirmDialogHeader, DialogTitle as ConfirmDialogTitle, DialogTrigger as ConfirmDialogTrigger } from '@/components/ui/dialog'; // Alias confirm dialog
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils'; // Import cn

export default function DataSettings({ onClose }) {
  const { conversations, activeConversationId, exportConversation, importConversation, clearAllConversations } = useConversationsStore();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false); // Keep separate state for import dialog
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  // Handle exporting all conversations
  const handleExportAll = () => {
    try {
      const exportData = {
        version: '1.0',
        conversations: conversations,
        exportedAt: new Date().toISOString(),
      };
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chatgpt-clone-export-${new Date().toISOString().slice(0, 10)}.json`;
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
      const conversationData = exportConversation(activeConversationId);
      if (!conversationData) throw new Error('Could not find conversation.');
      const jsonString = JSON.stringify(conversationData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${conversationData.title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: 'Export successful', description: 'Conversation exported.' });
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
        if (importData.version && importData.conversations) { // Full export
          for (const [, conversation] of Object.entries(importData.conversations)) {
            if (importConversation(conversation)) importedCount++;
          }
        } else if (importData.id && importData.messages) { // Single export
          if (importConversation(importData)) importedCount++;
        } else {
          throw new Error('Invalid file format.');
        }

        if (importedCount > 0) {
          toast({ title: 'Import successful', description: `Imported ${importedCount} conversation(s).` });
        } else {
          throw new Error('No valid conversations found.');
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

  // Handle clearing all conversations
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
          <ConfirmDialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <ConfirmDialogTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 w-full sm:w-auto">
                <Upload className="h-4 w-4" />
                Import from file...
              </Button>
            </ConfirmDialogTrigger>
            {/* Import Dialog Content */}
            <ConfirmDialogContent>
              <ConfirmDialogHeader>
                <ConfirmDialogTitle>Import Conversations</ConfirmDialogTitle>
              </ConfirmDialogHeader>
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
            </ConfirmDialogContent>
          </ConfirmDialog>
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
          <ConfirmDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
            <ConfirmDialogTrigger asChild>
              <Button variant="destructive" className="flex items-center gap-2 w-full sm:w-auto">
                <Trash2 className="h-4 w-4" />
                Clear all conversations...
              </Button>
            </ConfirmDialogTrigger>
            {/* Clear Confirmation Dialog Content */}
            <ConfirmDialogContent>
              <ConfirmDialogHeader>
                <ConfirmDialogTitle>Clear all conversations?</ConfirmDialogTitle>
              </ConfirmDialogHeader>
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
            </ConfirmDialogContent>
          </ConfirmDialog>
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