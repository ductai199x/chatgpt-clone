'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { useUIStore } from '@/lib/store/ui-store';
import { useChatStore } from '@/lib/store/chat-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { X, Copy, Check, Code as CodeIcon, FileText, Download, ChevronLeft, ChevronRight, Edit, Link as LinkIcon } from 'lucide-react';
import { cn, downloadTextFile, escapeHtml } from '@/lib/utils';

const stripCDATA = (content) => {
  if (typeof content !== 'string') return content;
  const trimmed = content.trim();
  if (trimmed.startsWith('<![CDATA[') && trimmed.endsWith(']]>')) {
    return trimmed.substring(9, trimmed.length - 3).trim();
  }
  return content;
};

function useDebouncedValue(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// ============================================================================
// Code Artifact Renderer (with Worker)
// ============================================================================
const CodeArtifactContent = React.memo(({ liveNodeData }) => {
  const workerRef = useRef(null);
  const [latestHighlightedCode, setLatestHighlightedCode] = useState('');
  const [stableHighlightedCode, setStableHighlightedCode] = useState('');
  const [isHighlighting, setIsHighlighting] = useState(false);

  const scrollAreaCompRef = useRef(null); // Ref for the scrollable container div
  const viewportRef = useRef(null);
  const userScrolledUpRef = useRef(false); // Ref to track if user manually scrolled

  const rawContent = useMemo(() => stripCDATA(liveNodeData?.content), [liveNodeData?.content]);
  const language = useMemo(() => liveNodeData?.metadata?.language || 'text', [liveNodeData?.metadata?.language]);
  const debouncedRawContent = useDebouncedValue(rawContent, 20); // Debounce for worker

  // --- Worker Lifecycle Management ---
  useEffect(() => {
    const worker = new Worker(new URL('../../workers/syntax-highlight.worker.js', import.meta.url), {
      type: 'module'
    });
    workerRef.current = worker;

    worker.onmessage = (event) => {
      let newCode = '';
      if (event.data.error) {
        console.error("Syntax highlighting worker error:", event.data.error);
        newCode = escapeHtml(debouncedRawContent); // Fallback to escaped raw content
      } else {
        newCode = event.data.highlightedCode;
        // --- Update stable code ONLY on successful highlight ---
        setStableHighlightedCode(newCode);
      }
      // Always update the latest code state
      setLatestHighlightedCode(newCode);
      setIsHighlighting(false); // Mark highlighting as complete
    };

    worker.onerror = (event) => {
      console.error('Worker onerror event:', event);
      console.error(`Worker error details: message='${event.message}', filename='${event.filename}', lineno='${event.lineno}'`);
      const fallbackCode = escapeHtml(debouncedRawContent);
      // Update both states on error to show fallback
      setLatestHighlightedCode(fallbackCode);
      setStableHighlightedCode(fallbackCode);
      setIsHighlighting(false);
    };

    // Cleanup on unmount
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      setLatestHighlightedCode('');
      setStableHighlightedCode('');
      setIsHighlighting(false);
      userScrolledUpRef.current = false; // Reset scroll state on unmount
    };
  }, []);

  // --- Send Data to Worker ---
  useEffect(() => {
    if (workerRef.current && debouncedRawContent !== undefined) {
      setIsHighlighting(true);
      workerRef.current.postMessage({
        code: debouncedRawContent,
        language: language
      });
    } else if (debouncedRawContent === '') {
      // Handle empty case directly
      setHighlightedCode('');
      setIsHighlighting(false);
    }
  }, [debouncedRawContent, language]); // Trigger on debounced content or language change

  // --- Prepare Lines for Rendering ---
  const linesToRender = useMemo(() => {
    // --- Use stable code if highlighting, otherwise use latest ---
    const contentToDisplay = isHighlighting ? stableHighlightedCode : latestHighlightedCode;
    const lines = contentToDisplay.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    if (lines.length === 1 && lines[0].trim() === '') return [];
    return lines;
    // Depend on the code states and highlighting flag
  }, [latestHighlightedCode, stableHighlightedCode, isHighlighting]);

  // --- Initial load handling ---
  // Set initial stable code when raw content first appears (and isn't empty)
  // This prevents showing "(Empty)" briefly on first load before highlighting finishes
  useEffect(() => {
    if (rawContent && !stableHighlightedCode && !latestHighlightedCode) {
      setStableHighlightedCode(escapeHtml(rawContent));
    }
  }, [rawContent]); // Run when rawContent changes

  // --- Scroll Event Listener Setup ---
  useEffect(() => {
    // Find the viewport element once the component mounts/updates
    // This selector might need adjustment based on ScrollArea's exact output HTML
    const viewportElement = scrollAreaCompRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewportElement) {
      viewportRef.current = viewportElement; // Store the viewport element

      const handleScroll = () => {
        const element = viewportRef.current;
        if (!element) return;

        const threshold = 20; // Pixels threshold from the bottom
        // scrollHeight can be fractional, ensure calculations are robust
        const isAtBottom = element.scrollHeight - Math.ceil(element.scrollTop) - element.clientHeight < threshold;

        if (!isAtBottom) {
          userScrolledUpRef.current = true;
        } else {
          userScrolledUpRef.current = false;
        }
      };

      // Add event listener directly to the viewport
      viewportElement.addEventListener('scroll', handleScroll, { passive: true });

      // Cleanup: remove event listener
      return () => {
        viewportElement.removeEventListener('scroll', handleScroll);
        viewportRef.current = null; // Clear the ref on cleanup
      };
    }
    // Re-run if the component ref changes (though it shouldn't often)
  }, [scrollAreaCompRef]);


  // --- Auto-Scroll Effect ---
  useEffect(() => {
    const element = viewportRef.current; // Use the viewport ref
    // Only scroll if the user hasn't manually scrolled up AND viewport exists
    if (element && !userScrolledUpRef.current) {
      requestAnimationFrame(() => {
        // Check element exists again inside animation frame
        if (viewportRef.current) {
          viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
        }
      });
    }
    // Run this effect whenever the lines change
  }, [linesToRender]); // Depend on linesToRender to trigger scroll on new content

  return (
    <ScrollArea className="h-full artifact-sidebar-scrollarea" ref={scrollAreaCompRef}>
      <div className="artifact-content-code p-4 pb-10">
        <pre
          key={language}
          className={cn("artifact-code-block w-full text-sm has-line-numbers")}
          style={{ margin: 0, background: 'transparent', whiteSpace: 'pre', wordBreak: 'normal' }}
        >
          <div className="code-lines-container">
            {linesToRender.length === 0 && !isHighlighting ? (
              <span className="text-muted-foreground">(Empty)</span>
            ) : (
              linesToRender.map((line, index) => (
                <div key={index} className="code-line">
                  <span className="line-number">{index + 1}</span>
                  <span
                    className="line-content"
                    dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }} // Use non-breaking space for empty lines
                  />
                </div>
              ))
            )}
          </div>
        </pre>
      </div>
    </ScrollArea>
  );
});
CodeArtifactContent.displayName = 'CodeArtifactContent';

// ============================================================================
// HTML Artifact Renderer
// ============================================================================
const HtmlArtifactContent = React.memo(({ liveNodeData }) => {
  const cleanHtmlContent = useMemo(() => stripCDATA(liveNodeData?.content), [liveNodeData?.content]);
  const title = useMemo(() => (
    `HTML Artifact: ${liveNodeData?.metadata?.filename || liveNodeData?.metadata?.title || `Artifact (${liveNodeData?.type})`}`
  ), [liveNodeData?.metadata, liveNodeData?.type]);

  return (
    <ScrollArea className="h-full artifact-sidebar-scrollarea">
      <div className="artifact-content-html p-4">
        <iframe
          srcDoc={cleanHtmlContent || '<p class="text-muted-foreground">(Empty HTML)</p>'}
          // Consider security implications of sandbox attributes carefully
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-[calc(100vh-150px)] border-none rounded bg-white" // Added bg-white for contrast
          title={title}
        />
      </div>
    </ScrollArea>
  );
});
HtmlArtifactContent.displayName = 'HtmlArtifactContent';

// ============================================================================
// Default Text Artifact Renderer
// ============================================================================
const DefaultArtifactContent = React.memo(({ liveNodeData }) => {
  const cleanDefaultContent = useMemo(() => stripCDATA(liveNodeData?.content), [liveNodeData?.content]);

  return (
    <ScrollArea className="h-full artifact-sidebar-scrollarea">
      {/* Use pre-wrap for better readability of plain text */}
      <pre className="artifact-content-default p-4 text-sm whitespace-pre-wrap break-words">
        {cleanDefaultContent || <span className="text-muted-foreground">(Empty)</span>}
      </pre>
    </ScrollArea>
  );
});
DefaultArtifactContent.displayName = 'DefaultArtifactContent';

// ============================================================================
// Main Artifact Sidebar Component
// ============================================================================
const ArtifactSidebar = ({ widthClass = "md:w-1/2" }) => {
  // --- UI State ---
  const isArtifactSidebarOpen = useUIStore(state => state.isArtifactSidebarOpen);
  const activeArtifactId = useUIStore(state => state.activeArtifactId);
  const activeArtifactConversationId = useUIStore(state => state.activeArtifactConversationId);
  const closeArtifactSidebar = useUIStore(state => state.closeArtifactSidebar);
  const requestReferenceInsert = useUIStore(state => state.requestReferenceInsert);

  // --- Chat/Artifact State ---
  const getArtifactChain = useChatStore(state => state.getArtifactChain);
  const getArtifactNode = useChatStore(state => state.getArtifactNode);
  const updateArtifactContentByUser = useChatStore(state => state.updateArtifactContentByUser);

  // --- Local Component State ---
  const [displayedVersionIndex, setDisplayedVersionIndex] = useState(-1); // Index in the artifactChain
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [copied, setCopied] = useState(false); // Feedback for copy button

  // --- Memoized Derived State ---
  // Fetch the chain based on the activeArtifactId (needed for version count/switching)
  const artifactChain = useMemo(() => {
    if (!activeArtifactConversationId || !activeArtifactId) return [];
    // getArtifactChain works with any ID within the chain
    return getArtifactChain(activeArtifactConversationId, activeArtifactId);
  }, [activeArtifactConversationId, activeArtifactId, getArtifactChain]);

  const totalVersions = artifactChain.length;

  // --- Effects ---

  // Set initial index based on the activeArtifactId when the sidebar opens or artifact changes
  useEffect(() => {
    if (artifactChain.length > 0 && activeArtifactId) {
      // Find the index of the currently active (clicked) artifact ID within its chain
      const initialIndex = artifactChain.findIndex(node => node.id === activeArtifactId);

      if (initialIndex !== -1) {
        setDisplayedVersionIndex(initialIndex);
      } else {
        // Fallback if activeArtifactId isn't found in the fetched chain (shouldn't happen ideally)
        console.warn(`Active artifact ID ${activeArtifactId} not found in its chain. Defaulting to latest.`);
        setDisplayedVersionIndex(artifactChain.length - 1);
      }
    } else {
      setDisplayedVersionIndex(-1); // Reset if no chain or ID
    }
    setIsEditing(false); // Ensure editing is off when artifact/version changes
    // Depend on the chain AND the specific activeArtifactId from the store
  }, [artifactChain, activeArtifactId]);

  // --- Derive displayedVersionId from the index ---
  // Snapshot of the currently selected version (for metadata, ID)
  const displayedVersionSnapshot = useMemo(() => {
    if (displayedVersionIndex < 0 || displayedVersionIndex >= totalVersions) return null;
    return artifactChain[displayedVersionIndex];
  }, [artifactChain, displayedVersionIndex, totalVersions]);

  // This ID is now derived from the correctly set index
  const displayedVersionId = displayedVersionSnapshot?.id;

  // --- Fetch live data based on the displayedVersionId ---
  // Live data for the currently selected version ID (using optimized selector)
  const liveNodeData = useChatStore(state => {
    // Fetch based on the ID derived from the index
    if (!activeArtifactConversationId || !displayedVersionId) return null;
    return getArtifactNode(activeArtifactConversationId, displayedVersionId);
  }, shallow); // Use shallow comparison

  // Determine artifact type, title, icon (prefer live data, fallback to snapshot)
  const artifactType = liveNodeData?.metadata?.type || displayedVersionSnapshot?.metadata?.type || 'unknown';
  const artifactTitle = liveNodeData?.metadata?.filename || liveNodeData?.metadata?.title || displayedVersionSnapshot?.metadata?.filename || displayedVersionSnapshot?.metadata?.title || `Artifact (${artifactType})`;
  const Icon = artifactType === 'code' ? CodeIcon : FileText;

  // Cleaned content for display/copy/download (from live data)
  const cleanContent = useMemo(() => stripCDATA(liveNodeData?.content), [liveNodeData?.content]);

  // Update editor content when not editing or when live data changes
  useEffect(() => {
    if (!isEditing) {
      setEditedContent(stripCDATA(liveNodeData?.content ?? ''));
    }
  }, [liveNodeData?.content]); // Re-sync editor content if live data changes externally

  // --- Callbacks ---
  const handleReferenceClick = useCallback(() => {
    if (displayedVersionId) {
      requestReferenceInsert(displayedVersionId); // <-- Use action from UI Store
    }
  }, [displayedVersionId, requestReferenceInsert]);

  // Version Switching
  const handleSwitchVersion = useCallback((direction) => {
    setIsEditing(false); // Exit editing mode
    const newIndex = direction === 'prev' ? displayedVersionIndex - 1 : displayedVersionIndex + 1;
    if (newIndex >= 0 && newIndex < totalVersions) {
      setDisplayedVersionIndex(newIndex); // This triggers fetching new liveNodeData via displayedVersionId
    }
  }, [displayedVersionIndex, totalVersions]);

  const canGoPrev = displayedVersionIndex > 0;
  const canGoNext = displayedVersionIndex < totalVersions - 1;

  // Actions
  const handleCopy = useCallback(() => {
    if (!cleanContent) return;
    navigator.clipboard.writeText(cleanContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(err => console.error("Failed to copy artifact content:", err));
  }, [cleanContent]);

  const handleDownload = useCallback(() => {
    if (!cleanContent) return;
    // Determine filename and MIME type within the handler or memoize them if complex
    const nodeForFilename = liveNodeData || displayedVersionSnapshot;
    let filename = nodeForFilename?.metadata?.filename;
    let mimeType = 'text/plain';

    if (!filename) {
      const extensionMap = { code: 'txt', html: 'html', json: 'json', markdown: 'md' };
      const lang = nodeForFilename?.metadata?.language;
      const ext = artifactType === 'code' && lang ? `.${lang}` : `.${extensionMap[artifactType] || 'txt'}`;
      const versionSuffix = totalVersions > 1 ? `_v${displayedVersionIndex + 1}` : '';
      filename = `artifact-${artifactType}${versionSuffix}${ext}`;
    }

    if (artifactType === 'html') mimeType = 'text/html';
    else if (artifactType === 'json') mimeType = 'application/json';
    else if (artifactType === 'markdown') mimeType = 'text/markdown';

    downloadTextFile(cleanContent, filename, mimeType);
  }, [cleanContent, liveNodeData, displayedVersionSnapshot, artifactType, totalVersions, displayedVersionIndex]);

  // Editing
  const handleEditToggle = useCallback(() => {
    if (isEditing) {
      setIsEditing(false);
      // Optionally reset editedContent to live content on cancel
      setEditedContent(stripCDATA(liveNodeData?.content ?? ''));
    } else {
      // Initialize editor with current live content when starting edit
      setEditedContent(stripCDATA(liveNodeData?.content ?? ''));
      setIsEditing(true);
    }
  }, [isEditing, liveNodeData?.content]);

  const handleSaveEdit = useCallback(() => {
    if (!activeArtifactConversationId || !displayedVersionSnapshot) return;
    // Use the snapshot's ID to ensure we update based on the viewed version's chain history
    updateArtifactContentByUser(activeArtifactConversationId, displayedVersionSnapshot.id, editedContent);
    setIsEditing(false);
  }, [activeArtifactConversationId, displayedVersionSnapshot, editedContent, updateArtifactContentByUser]);


  // --- Render Logic ---

  const renderContent = () => {
    if (!liveNodeData && displayedVersionIndex !== -1) { // Handle loading state after index is set
      return <div className="p-4 text-center text-muted-foreground">Loading artifact version...</div>;
    }
    if (!displayedVersionSnapshot) { // Handle case where no artifact is selected/found
      return <div className="p-4 text-center text-muted-foreground">No artifact selected or found.</div>;
    }

    if (isEditing) {
      return (
        <ScrollArea className="h-full p-4">
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="w-full h-[calc(100vh-150px)] resize-none font-mono text-sm border rounded-md p-2"
            placeholder="Edit artifact content..."
          />
        </ScrollArea>
      );
    }

    // Pass liveNodeData which contains the actual content for rendering
    switch (artifactType) {
      case 'code': return <CodeArtifactContent liveNodeData={liveNodeData} />;
      case 'html': return <HtmlArtifactContent liveNodeData={liveNodeData} />;
      default: return <DefaultArtifactContent liveNodeData={liveNodeData} />;
    }
  };

  return (
    <div className={cn(
      "fixed inset-y-0 right-0 z-40 bg-background border-l border-border shadow-lg",
      "flex flex-col w-full", // Mobile first: full width
      widthClass, // Apply desktop width override
      "transition-transform duration-300 ease-in-out",
      isArtifactSidebarOpen ? "translate-x-0" : "translate-x-full"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border shrink-0 h-14 gap-2">
        {/* Left: Title & Streaming Indicator */}
        <div className="flex items-center truncate mr-1" title={artifactTitle}>
          <Icon className="h-4 w-4 mr-2 shrink-0" />
          <span className="font-medium truncate">{artifactTitle}</span>
          {liveNodeData && !liveNodeData.isComplete && (
            <span className="text-xs text-muted-foreground ml-2 animate-pulse">(Streaming...)</span>
          )}
        </div>

        {/* Right: Version Switcher & Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Version Switcher */}
          {totalVersions > 1 && !isEditing && (
            <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5 mr-1">
              <Button variant="ghost" size="icon" onClick={() => handleSwitchVersion('prev')} disabled={!canGoPrev} className="h-6 w-6" title="Previous version">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium text-muted-foreground tabular-nums px-1">
                {displayedVersionIndex + 1} / {totalVersions}
              </span>
              <Button variant="ghost" size="icon" onClick={() => handleSwitchVersion('next')} disabled={!canGoNext} className="h-6 w-6" title="Next version">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Action Buttons */}
          {isEditing ? (
            <>
              <Button variant="default" size="sm" onClick={handleSaveEdit} className="h-8 px-2">Save</Button>
              <Button variant="ghost" size="icon" onClick={handleEditToggle} title="Cancel edit" className="h-8 w-8">
                <X className="h-4 w-4" /> <span className="sr-only">Cancel</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleReferenceClick}
                disabled={!displayedVersionId} // Disable if no artifact is displayed
                className="h-8 w-8"
                aria-label={`Reference this artifact: ${artifactTitle}`}
                title={`Reference this artifact: ${artifactTitle}`}
              >
                <LinkIcon className="h-4 w-4" />
                <span className="sr-only">Reference this artifact</span>
              </Button>

              {/* Show Edit button only if there's content */}
              {liveNodeData && (
                <Button variant="ghost" size="icon" onClick={handleEditToggle} title="Edit artifact" className="h-8 w-8">
                  <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={handleCopy} title={copied ? "Copied!" : "Copy content"} disabled={!cleanContent || copied} className="h-8 w-8">
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />} <span className="sr-only">Copy</span>
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDownload} title="Download artifact" disabled={!cleanContent} className="h-8 w-8">
                <Download className="h-4 w-4" /> <span className="sr-only">Download</span>
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={closeArtifactSidebar} className="h-8 w-8">
            <X className="h-4 w-4" /> <span className="sr-only">Close</span>
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-grow overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
};

export default ArtifactSidebar;