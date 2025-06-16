'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { useUIStore } from '@/lib/store/ui-store';
import { useChatStore } from '@/lib/store/chat-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { X, Copy, Check, Code as CodeIcon, FileText, Download, ChevronLeft, ChevronRight, Edit, Link as LinkIcon, FileWarning } from 'lucide-react';
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
  }, [debouncedRawContent]);

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
  }, [rawContent, stableHighlightedCode, latestHighlightedCode]); // Run when rawContent changes

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
      <div className="artifact-content-code">
        <pre
          key={language}
          className={cn("artifact-code-block w-full text-sm has-line-numbers")}
          style={{ margin: 0, background: 'transparent', whiteSpace: 'pre', wordBreak: 'normal' }}
        >
          <div className="code-lines-container">
            {linesToRender.length === 0 && !isHighlighting ? (
              <span className="artifact-content-empty-text">(Empty)</span>
            ) : (
              linesToRender.map((line, index) => (
                <div key={index} className="code-line">
                  <span className="line-number">{index + 1}</span>
                  <span
                    className="line-content"
                    dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }}
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
      <div className="artifact-content-html">
        <iframe
          srcDoc={cleanHtmlContent || '<p class="artifact-content-empty-text">(Empty HTML)</p>'}
          sandbox="allow-scripts allow-same-origin"
          className="artifact-content-html-iframe"
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
      <pre className="artifact-content-default">
        {cleanDefaultContent || <span className="artifact-content-empty-text">(Empty)</span>}
      </pre>
    </ScrollArea>
  );
});
DefaultArtifactContent.displayName = 'DefaultArtifactContent';

// ============================================================================
// Main Artifact Sidebar Component
// ============================================================================
const MIN_SIDEBAR_WIDTH = 450; // Minimum width in pixels
const MAX_SIDEBAR_WIDTH_PERCENT = 70; // Max width as percentage of window width

const ArtifactSidebar = () => {
  // --- UI State ---
  const isArtifactSidebarOpen = useUIStore(state => state.isArtifactSidebarOpen);
  const activeArtifactId = useUIStore(state => state.activeArtifactId);
  const activeArtifactConversationId = useUIStore(state => state.activeArtifactConversationId);
  const closeArtifactSidebar = useUIStore(state => state.closeArtifactSidebar);
  const requestReferenceInsert = useUIStore(state => state.requestReferenceInsert);
  const sidebarWidth = useUIStore(state => state.sidebarWidth);
  const setSidebarWidth = useUIStore(state => state.setSidebarWidth);

  // --- Chat/Artifact State ---
  const getArtifactChain = useChatStore(state => state.getArtifactChain);
  const getArtifactNode = useChatStore(state => state.getArtifactNode);
  const updateArtifactContentByUser = useChatStore(state => state.updateArtifactContentByUser);

  // --- Local Component State ---
  const [displayedVersionIndex, setDisplayedVersionIndex] = useState(-1); // Index in the artifactChain
  const [isOrphaned, setIsOrphaned] = useState(false); // Track if the artifact is orphaned
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [copied, setCopied] = useState(false);
  const isResizingRef = useRef(false);
  const sidebarRef = useRef(null);

  // --- Memoized Derived State ---
  // Fetch the chain based on the activeArtifactId (needed for version count/switching)
  const artifactChain = useMemo(() => {
    if (!activeArtifactConversationId || !activeArtifactId) return [];
    // getArtifactChain works with any ID within the chain
    const chain = getArtifactChain(activeArtifactConversationId, activeArtifactId);
    if (chain.length > 0 && chain.findIndex(node => node.id === activeArtifactId) === -1) {
      setIsOrphaned(true); // Mark as orphaned if the ID is not found in the chain
      return []; // No valid chain found
    }
    setIsOrphaned(false); // Reset orphaned state if valid chain found
    return chain;
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
        setDisplayedVersionIndex(-1);
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
    let artifact = null;
    if (displayedVersionIndex < 0) {
      artifact = getArtifactNode(activeArtifactConversationId, activeArtifactId);
      if (!artifact) return null; // No artifact found
    } else if (displayedVersionIndex >= totalVersions) {
      artifact = artifactChain[totalVersions - 1]; // Fallback to the latest version
    } else {
      artifact = artifactChain[displayedVersionIndex]; // Get the current version
    }
    return artifact;
  }, [artifactChain, displayedVersionIndex, totalVersions, activeArtifactConversationId, activeArtifactId, getArtifactNode]);

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
  }, [liveNodeData?.content, isEditing]); // Re-sync editor content if live data changes externally

  // --- Callbacks ---
  // --- Resizing Logic ---
  const handleMouseDown = useCallback((e) => {
    // Only allow resizing on larger screens (where the handle is visible)
    if (window.innerWidth < 768) return;

    e.preventDefault(); // Prevent text selection
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize'; // Optional: Set cursor globally
    sidebarRef.current.classList.add('is-resizing');
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp, { once: true }); // Use { once: true } for mouseup
  }, [handleMouseMove, handleMouseUp]);

  const handleMouseMove = useCallback((e) => {
    // No need to check isResizingRef.current, listener is only active during drag
    if (!sidebarRef.current) return;

    const newWidth = window.innerWidth - e.clientX;
    const maxWidth = window.innerWidth * (MAX_SIDEBAR_WIDTH_PERCENT / 100);
    const constrainedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(newWidth, maxWidth));

    // --- Direct DOM Manipulation ---
    // Update the style directly for immediate visual feedback without React re-render
    sidebarRef.current.style.width = `${constrainedWidth}px`;
    // --- DO NOT setSidebarWidth here ---

  }, []);

  const handleMouseUp = useCallback(() => {
    if (isResizingRef.current && sidebarRef.current) {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      sidebarRef.current.classList.remove('is-resizing'); // Remove class to re-enable transition

      // --- Update React State ---
      // Get the final width from the style and update the React state
      // Use parseFloat to handle potential 'px' suffix and ensure it's a number
      const finalWidth = parseFloat(sidebarRef.current.style.width);
      if (!isNaN(finalWidth)) {
        setSidebarWidth(finalWidth);
      }

      window.removeEventListener('mousemove', handleMouseMove);
      // No need to remove mouseup due to { once: true }
    }
  }, [handleMouseMove, setSidebarWidth]);

  // Cleanup global listeners on unmount
  useEffect(() => {
    const sidebarElement = sidebarRef.current; // Copy ref value for cleanup
    return () => {
      if (isResizingRef.current) {
        document.body.style.cursor = '';
        sidebarElement?.classList.remove('is-resizing'); // Ensure class is removed
        window.removeEventListener('mousemove', handleMouseMove);
        // If not using { once: true }, you'd need: window.removeEventListener('mouseup', handleMouseUp);
      }
    };
  }, [handleMouseMove, handleMouseUp]);

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
    if (!liveNodeData && displayedVersionIndex !== -1) {
      return <div className="artifact-sidebar-loading-state">Loading artifact version...</div>;
    }
    if (!displayedVersionSnapshot) {
      return <div className="artifact-sidebar-empty-state">No artifact selected or found.</div>;
    }

    if (isEditing) {
      return (
        <ScrollArea className="artifact-sidebar-editor-scrollarea">
          <Textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="artifact-sidebar-editor-textarea"
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
    <div
      ref={sidebarRef}
      className={cn(
        "artifact-sidebar-container",
        isArtifactSidebarOpen ? "translate-x-0" : "translate-x-full"
      )}
      style={{
        width: isArtifactSidebarOpen
          ? `min(100%, max(${MIN_SIDEBAR_WIDTH}px, ${sidebarWidth}px))` // Ensure width respects constraints and doesn't exceed 100%
          : '0px',
      }}
    >
      {/* Resizer Handle */}
      <div
        className="artifact-sidebar-resizer"
        onMouseDown={handleMouseDown}
        title="Resize sidebar"
      />

      {/* Header */}
      <div className="artifact-sidebar-header">
        {/* Left: Title & Streaming Indicator */}
        <div className="artifact-sidebar-header-title-section" title={artifactTitle}>
          <Icon className="artifact-sidebar-header-icon" />
          <span className="artifact-sidebar-header-title">{artifactTitle}</span>
          {liveNodeData && !liveNodeData.isComplete && (
            <span className="artifact-sidebar-header-streaming">(Streaming...)</span>
          )}
        </div>

        {/* Right: Version Switcher & Actions */}
        <div className="artifact-sidebar-header-actions-section">
          {/* Version Switcher */}
          {
            isOrphaned && (
              <span className="flex items-end gap-1">
                <FileWarning className="h-4 w-4 mb-[2px] text-red-500" />
                <span className="text-red-500 text-xs mb-[2px]">Orphaned artifact</span>
              </span>
            )
          }
          {totalVersions > 1 && !isEditing && (
            <div className="artifact-sidebar-version-switcher">
              <Button variant="ghost" size="icon" onClick={() => handleSwitchVersion('prev')} disabled={!canGoPrev} className="artifact-sidebar-version-switcher-button" title="Previous version">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="artifact-sidebar-version-switcher-text">
                {displayedVersionIndex + 1} / {totalVersions}
              </span>
              <Button variant="ghost" size="icon" onClick={() => handleSwitchVersion('next')} disabled={!canGoNext} className="artifact-sidebar-version-switcher-button" title="Next version">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Action Buttons */}
          {isEditing ? (
            <>
              <Button variant="default" size="sm" onClick={handleSaveEdit} className="h-8 px-2">Save</Button>
              <Button variant="ghost" size="icon" onClick={handleEditToggle} title="Cancel edit" className="artifact-sidebar-action-button">
                <X className="h-4 w-4" /> <span className="sr-only">Cancel</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleReferenceClick}
                disabled={!displayedVersionId}
                className="artifact-sidebar-action-button"
                aria-label={`Reference this artifact: ${artifactTitle}`}
                title={`Reference this artifact: ${artifactTitle}`}
              >
                <LinkIcon className="h-4 w-4" />
                <span className="sr-only">Reference this artifact</span>
              </Button>

              {liveNodeData && (
                <Button variant="ghost" size="icon" onClick={handleEditToggle} title="Edit artifact" className="artifact-sidebar-action-button">
                  <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={handleCopy} title={copied ? "Copied!" : "Copy content"} disabled={!cleanContent || copied} className="artifact-sidebar-action-button">
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />} <span className="sr-only">Copy</span>
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDownload} title="Download artifact" disabled={!cleanContent} className="artifact-sidebar-action-button">
                <Download className="h-4 w-4" /> <span className="sr-only">Download</span>
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={closeArtifactSidebar} className="artifact-sidebar-action-button">
            <X className="h-4 w-4" /> <span className="sr-only">Close</span>
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="artifact-sidebar-content-area">
        {renderContent()}
      </div>
    </div>
  );
};

export default ArtifactSidebar;