'use client';

import { useState, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Upload, Trash2 } from 'lucide-react';
import { useConversationsStore } from '@/lib/store/conversations-store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

export default function DataSettings({ onClose }) {
  const { conversations, activeConversationId, exportConversation, importConversation, clearAllConversations } = useConversationsStore();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const fileInputRef = useRef(null);
  const { toast } = useToast();
  
  // Handle exporting all conversations
  const handleExportAll = () => {
    try {
      // Create a unified export of all conversations
      const exportData = {
        version: '1.0',
        conversations: conversations,
        exportedAt: new Date().toISOString(),
      };
      
      // Convert to JSON and create download link
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create a temporary anchor element and trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `chatgpt-clone-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: 'Export successful',
        description: 'All conversations have been exported.',
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: 'Export failed',
        description: error.message || 'An error occurred during export.',
        variant: 'destructive',
      });
    }
  };
  
  // Handle exporting current conversation
  const handleExportCurrent = () => {
    if (!activeConversationId) {
      toast({
        title: 'Export failed',
        description: 'No active conversation to export.',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      const conversationData = exportConversation(activeConversationId);
      
      if (!conversationData) {
        toast({
          title: 'Export failed',
          description: 'Could not find the current conversation.',
          variant: 'destructive',
        });
        return;
      }
      
      // Convert to JSON and create download link
      const jsonString = JSON.stringify(conversationData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create a temporary anchor element and trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `${conversationData.title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: 'Export successful',
        description: 'Conversation has been exported.',
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: 'Export failed',
        description: error.message || 'An error occurred during export.',
        variant: 'destructive',
      });
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
        
        // Handle different import formats
        if (importData.version && importData.conversations) {
          // This is a full export with multiple conversations
          // For each conversation in the export, import it
          let importedCount = 0;
          
          for (const [id, conversation] of Object.entries(importData.conversations)) {
            const conversationId = importConversation(conversation);
            if (conversationId) importedCount++;
          }
          
          if (importedCount > 0) {
            toast({
              title: 'Import successful',
              description: `Imported ${importedCount} conversation(s).`,
            });
          } else {
            toast({
              title: 'Import failed',
              description: 'No valid conversations found in the import file.',
              variant: 'destructive',
            });
          }
        } else if (importData.id && importData.messages) {
          // This is a single conversation export
          const conversationId = importConversation(importData);
          
          if (conversationId) {
            toast({
              title: 'Import successful',
              description: 'Conversation has been imported.',
            });
          } else {
            toast({
              title: 'Import failed',
              description: 'Invalid conversation format.',
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'Import failed',
            description: 'Invalid file format. The file does not contain valid conversation data.',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Import failed:', error);
        toast({
          title: 'Import failed',
          description: 'Invalid JSON format or file structure.',
          variant: 'destructive',
        });
      }
    };
    
    reader.onerror = () => {
      toast({
        title: 'Import failed',
        description: 'Error reading the file.',
        variant: 'destructive',
      });
    };
    
    reader.readAsText(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Close the import dialog
    setImportDialogOpen(false);
  };
  
  // Handle clearing all conversations
  const handleClearAll = () => {
    clearAllConversations();
    setConfirmClearOpen(false);
    
    toast({
      title: 'Conversations cleared',
      description: 'All conversations have been deleted.',
    });
    
    // Close the settings dialog
    onClose();
  };
  
  return (
    <div className="space-y-6">
      {/* Import/Export section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Import/Export</h3>
        
        {/* Export options */}
        <div className="space-y-2">
          <Label>Export conversations</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button 
              variant="outline" 
              className="flex items-center gap-2"
              onClick={handleExportAll}
            >
              <Download className="h-4 w-4" />
              Export all conversations
            </Button>
            
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={handleExportCurrent}
              disabled={!activeConversationId}
            >
              <Download className="h-4 w-4" />
              Export current conversation
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Download your conversation history as JSON files.
          </p>
        </div>
        
        {/* Import dialog */}
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Import conversations
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Conversation</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Select a JSON file containing conversation data to import.
                The file should be a previously exported conversation or conversations.
              </p>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
              />
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> Importing conversations with the same ID will overwrite existing conversations.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Data management section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Data Management</h3>
        
        {/* Clear data */}
        <div className="space-y-2">
          <Label>Clear conversation data</Label>
          <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                Clear all conversations
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear all conversations?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This will permanently delete all your conversation history. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2 mt-4">
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
          <p className="text-sm text-muted-foreground">
            Delete all conversation history from your device.
          </p>
        </div>
        
        {/* Local storage info */}
        <div className="rounded-md bg-muted p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Privacy Note:</strong> All data is stored locally in your browser.
            No conversation data is sent to or stored on our servers.
          </p>
        </div>
      </div>
    </div>
  );
}