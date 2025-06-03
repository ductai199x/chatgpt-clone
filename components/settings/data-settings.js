'use client';

import { useState, useRef, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Download, Upload, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

export default function DataSettings({ onClose }) {
  const activeConversationId = useChatStore(state => state.activeConversationId);
  const getConversation = useChatStore(state => state.getConversation);
  const clearAllConversations = useChatStore(state => state.clearAllConversations);

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [isConvertingChatGPT, setIsConvertingChatGPT] = useState(false);
  const [chatGPTConversionProgress, setChatGPTConversionProgress] = useState(0);
  const [chatGPTConversionStatus, setChatGPTConversionStatus] = useState("");
  const [chatGPTConversionLog, setChatGPTConversionLog] = useState([]);
  const [isLogVisible, setIsLogVisible] = useState(false);

  const nativeFileInputRef = useRef(null);
  const chatGPTFileInputRef = useRef(null);
  const logContainerRef = useRef(null);
  const workerRef = useRef(null);
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

  const handleNativeImportClick = () => {
    nativeFileInputRef.current?.click();
  };

  const handleChatGPTImportClick = () => {
    chatGPTFileInputRef.current?.click();
  };

  // Handler for native JSON file import
  const handleNativeFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const fileContent = event.target?.result;
        if (typeof fileContent !== 'string') {
          throw new Error('Failed to read file content.');
        }
        const importData = JSON.parse(fileContent);
        let conversationsToImport = {};
        let importedCount = 0;

        // Logic for importing app's native format
        if (importData.conversations && typeof importData.conversations === 'object') {
          conversationsToImport = importData.conversations;
        } else if (typeof importData === 'object' && Object.values(importData).every(conv => conv.message_nodes && conv.artifact_nodes)) {
          // Fallback for older format (object of conversations)
          conversationsToImport = importData;
        } else {
          throw new Error('Invalid or unsupported native file format. Expected "conversations" key or a direct object of conversations.');
        }

        importedCount = Object.keys(conversationsToImport).length;

        if (importedCount > 0) {
          useChatStore.setState(state => {
            const newConversations = { ...state.conversations };
            let firstImportedId = null;
            for (const [id, conversation] of Object.entries(conversationsToImport)) {
              if (!newConversations[id]) { // Avoid overwriting existing by ID, or decide on a strategy
                newConversations[id] = conversation;
                if (!firstImportedId) firstImportedId = id;
              } else {
                // Handle ID conflict, e.g., generate new ID or skip
                const newId = generateId('conv'); // Make sure generateId is available or import from utils
                newConversations[newId] = conversation;
                if (!firstImportedId) firstImportedId = newId;
                console.warn(`Conversation ID ${id} already exists. Imported with new ID ${newId}.`);
              }
            }
            state.conversations = newConversations;
            if (!state.activeConversationId && firstImportedId) {
              state.activeConversationId = firstImportedId;
            }
          });
          toast({ title: 'Import successful', description: `Imported ${importedCount} conversation(s).` });
        } else {
          throw new Error('No valid conversations found in the file.');
        }

      } catch (error) {
        console.error('Native import failed:', error);
        toast({ title: 'Import failed', description: error.message || 'Invalid format or structure.', variant: 'destructive' });
      } finally {
        if (nativeFileInputRef.current) nativeFileInputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      toast({ title: 'Import failed', description: 'Error reading file.', variant: 'destructive' });
      if (nativeFileInputRef.current) nativeFileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // Handler for ChatGPT JSON file import
  const handleChatGPTFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsConvertingChatGPT(true);
    setChatGPTConversionProgress(0);
    setChatGPTConversionStatus("Initializing conversion...");
    setChatGPTConversionLog([]); // Reset log for new conversion

    // Terminate existing worker if any
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    // Create a new worker
    // Ensure chatgpt-conversion.worker.js is in your public folder or configured for worker loading
    workerRef.current = new Worker(new URL('../../workers/chatgpt-conversion.worker.js', import.meta.url), { type: 'module' });

    workerRef.current.onmessage = (event) => {
      const {
        type,
        data,
        message, // For errors or warnings
        // Progress specific fields
        overallConversationsProcessed, // Renamed from 'processed' for clarity
        totalConversations, // Renamed from 'total' for clarity
        currentConversationTitle, // Renamed from 'currentTitle'
        currentConversationStage,
        currentConversationNodesProcessed,
        currentConversationTotalNodes,
        currentNodeBeingProcessedType
      } = event.data;

      if (type === 'progress') {
        // Overall progress bar (conversation level)
        const overallProgressPercentage = totalConversations > 0 ? (overallConversationsProcessed / totalConversations) * 100 : 0;
        setChatGPTConversionProgress(overallProgressPercentage);

        // Detailed status message
        let statusMessage = `Overall: ${overallConversationsProcessed}/${totalConversations} conversations.`;
        if (currentConversationTitle) {
          statusMessage = `Processing "${currentConversationTitle}" (${overallConversationsProcessed + 1}/${totalConversations}): `;

          switch (currentConversationStage) {
            case 'starting_conversation':
              statusMessage += 'Starting...';
              break;
            case 'initializing':
              statusMessage += `Initializing (0/${currentConversationTotalNodes} nodes).`;
              break;
            case 'processing_main_branch':
              statusMessage += `Main branch (${currentConversationNodesProcessed}/${currentConversationTotalNodes} nodes).`;
              if (currentNodeBeingProcessedType) {
                statusMessage += ` Current: ${currentNodeBeingProcessedType}.`;
              }
              break;
            case 'processing_side_branches':
            case 'processing_side_branches_from_grandparent':
              statusMessage += `Side branches (after node ${currentConversationNodesProcessed}/${currentConversationTotalNodes}).`;
              break;
            case 'completed':
              statusMessage = `Finished "${currentConversationTitle}" (${overallConversationsProcessed + 1}/${totalConversations}).`;
              break;
            case 'skipped_early':
            case 'skipped_no_messages':
              statusMessage = `Skipped "${currentConversationTitle}" (${overallConversationsProcessed + 1}/${totalConversations}). Stage: ${currentConversationStage}.`;
              break;
            case 'all_processing_finished':
              statusMessage = `Conversion complete. Processed ${totalConversations} conversations.`;
              // Ensure progress bar is 100%
              setChatGPTConversionProgress(100);
              break;
            default:
              statusMessage += `Stage: ${currentConversationStage || 'processing...'}`;
          }
        } else if (currentConversationStage === 'all_processing_finished') {
          statusMessage = `Conversion complete. Processed ${totalConversations} conversations.`;
          setChatGPTConversionProgress(100);
        } else {
          statusMessage = `Processed ${overallConversationsProcessed}/${totalConversations} conversations.`;
        }
        setChatGPTConversionStatus(statusMessage);
        setChatGPTConversionLog(prev => [...prev, statusMessage]);
        console.log(`Worker Progress: ${statusMessage}`);
      } else if (type === 'complete') {
        const importedConversations = data.conversations;
        const importedCount = Object.keys(importedConversations).length;

        if (importedCount > 0) {
          useChatStore.setState(state => {
            const newConversations = { ...state.conversations };
            let firstImportedId = null;
            for (const [id, conversation] of Object.entries(importedConversations)) {
              // Similar ID conflict handling as in native import
              if (!newConversations[id]) {
                newConversations[id] = conversation;
                if (!firstImportedId) firstImportedId = id;
              } else {
                const newId = generateId('conv'); // Ensure generateId is available
                newConversations[newId] = conversation;
                if (!firstImportedId) firstImportedId = newId;
                console.warn(`ChatGPT Import: Conversation ID ${id} already exists. Imported with new ID ${newId}.`);
              }
            }
            state.conversations = newConversations;
            if (!state.activeConversationId && firstImportedId) {
              state.activeConversationId = firstImportedId;
            }
          });
          toast({ title: 'ChatGPT Import Successful', description: `Converted and imported ${importedCount} conversation(s).` });
        } else {
          toast({ title: 'ChatGPT Import Note', description: 'No valid conversations were found or converted from the file.', variant: 'default' });
        }
        setIsConvertingChatGPT(false);
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = null;
      } else if (type === 'error') {
        const errorMessage = `Error: ${message}`;
        toast({ title: 'ChatGPT Conversion Failed', description: message, variant: 'destructive' });
        setChatGPTConversionStatus(errorMessage);
        setChatGPTConversionLog(prevLog => [...prevLog, errorMessage]);
        setIsConvertingChatGPT(false);
        if (workerRef.current) workerRef.current.terminate();
        workerRef.current = null;
      } else if (type === 'warning' || type === 'debug' || type === 'log') {
        const logMessage = `Worker [${type.toUpperCase()}]: ${message}`;
        console.warn(logMessage);
        setChatGPTConversionLog(prevLog => [...prevLog, logMessage]);
        // Optionally show non-critical warnings in a less intrusive way
      }
    };

    workerRef.current.onerror = (error) => {
      const errorMessage = `Worker Error: ${error.message || 'An unexpected worker error occurred.'}`;
      console.error('Worker error:', error);
      toast({ title: 'ChatGPT Conversion Error', description: errorMessage, variant: 'destructive' });
      setChatGPTConversionStatus(errorMessage);
      setChatGPTConversionLog(prevLog => [...prevLog, errorMessage]);
      setIsConvertingChatGPT(false);
      if (workerRef.current) workerRef.current.terminate();
      workerRef.current = null;
    };

    const reader = new FileReader();
    reader.onload = (readEvent) => {
      const fileContent = readEvent.target?.result;
      if (typeof fileContent === 'string') {
        workerRef.current?.postMessage({ fileContent });
      } else {
        toast({ title: 'File Read Error', description: 'Could not read file content for conversion.', variant: 'destructive' });
        setIsConvertingChatGPT(false);
      }
    };
    reader.onerror = () => {
      toast({ title: 'File Read Error', description: 'Error reading file for conversion.', variant: 'destructive' });
      setIsConvertingChatGPT(false);
    };
    reader.readAsText(file);

    if (chatGPTFileInputRef.current) chatGPTFileInputRef.current.value = '';
  };

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [chatGPTConversionLog]); // Auto-scroll when log updates

  // Cleanup worker on component unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

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
          {/* Hidden file inputs */}
          <input type="file" accept=".json" ref={nativeFileInputRef} onChange={handleNativeFileSelect} style={{ display: 'none' }} />
          <input type="file" accept=".json" ref={chatGPTFileInputRef} onChange={handleChatGPTFileSelect} style={{ display: 'none' }} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 w-full sm:w-auto" disabled={isConvertingChatGPT}>
                <Upload className="h-4 w-4" />
                Import from file...
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={handleNativeImportClick} disabled={isConvertingChatGPT}>
                Native App JSON
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleChatGPTImportClick} disabled={isConvertingChatGPT}>
                ChatGPT Export JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Conversion Progress UI */}
          <div className="space-y-2 pt-2">
            <Progress value={chatGPTConversionProgress} className="w-full" />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <p>{chatGPTConversionStatus}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsLogVisible(!isLogVisible)}
                aria-expanded={isLogVisible}
                aria-controls="conversion-log-container"
                className="p-1"
              >
                {isLogVisible ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="sr-only">{isLogVisible ? "Hide log" : "Show log"}</span>
              </Button>
            </div>
            <div
              id="conversion-log-container"
              ref={logContainerRef}
              className={cn(
                "import-log-container w-full overflow-y-auto text-xs text-muted-foreground transition-all duration-300 ease-in-out",
                isLogVisible
                  ? "max-h-22 opacity-100 p-2 border bg-muted rounded-md mt-1" // Visible styles
                  : "max-h-0 opacity-0 p-0 border-0 mt-0 overflow-hidden"   // Hidden styles
              )}
            >
              {chatGPTConversionLog.map((logEntry, index) => (
                <div key={index}>{logEntry}</div>
              ))}
            </div>
          </div>

          <p className="settings-item-description"> {/* Use description class */}
            Upload a previously exported JSON file.
            <br /> {/* Optional: for better formatting of the note */}
            <strong>Note:</strong> Importing may overwrite conversations with the same ID if they exist in your current data.
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