'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { useArtifactsStore } from '@/lib/store/artifacts-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Copy, Check, Code as CodeIcon, FileText, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'; // Or your preferred theme
import { cn, downloadTextFile } from '@/lib/utils';

const stripCDATA = (content) => {
  if (typeof content !== 'string') return content; // Handle null/undefined/non-string
  const trimmed = content.trim();
  if (trimmed.startsWith('<![CDATA[') && trimmed.endsWith(']]>')) {
    // Extract content between <![CDATA[ and ]]>
    return trimmed.substring(9, trimmed.length - 3).trim();
  }
  // Return original content if not wrapped or improperly wrapped
  return content;
};

// --- Artifact Content Renderers ---

const CodeArtifactContent = ({ version }) => {
  const cleanCodeString = useMemo(() => stripCDATA(version?.content), [version?.content]);

  return (
    <ScrollArea className="h-full artifact-sidebar-scrollarea">
      {/* Removed relative positioning and copy button */}
      <div className="artifact-content-code">
        <SyntaxHighlighter
          language={version?.metadata?.language || 'text'}
          style={vscDarkPlus}
          className="!m-0 !p-4 text-sm rounded-b-md"
          customStyle={{ background: 'hsl(var(--muted))' }}
          showLineNumbers={true}
          wrapLines={true}
          wrapLongLines={true}
        >
          {cleanCodeString || '(Empty)'}
        </SyntaxHighlighter>
      </div>
    </ScrollArea>
  );
};

const HtmlArtifactContent = ({ version }) => {
  // WARNING: dangerouslySetInnerHTML is risky. Consider a sandboxed iframe for production.
  // For now, we'll use it for simplicity.
  const cleanHtmlContent = useMemo(() => stripCDATA(version?.content), [version?.content]);

  return (
    <div className="artifact-content-html p-4">
      <iframe
        srcDoc={cleanHtmlContent || '<p>(Empty HTML)</p>'}
        sandbox="allow-scripts allow-same-origin" // Basic sandboxing
        className="w-full h-[calc(100vh-150px)] border-none rounded" // Adjust height as needed
        title={`HTML Artifact: ${version?.metadata?.filename || version?.metadata?.title || `Artifact (${version?.type})`}`}
      />
      {/* Fallback if iframe fails or for simpler display:
       <div dangerouslySetInnerHTML={{ __html: cleanHtmlContent || '<p>(Empty HTML)</p>' }} />
       */}
    </div>
  );
};

const DefaultArtifactContent = ({ version }) => {
  // Simple preformatted text for unknown types
  const cleanDefaultContent = useMemo(() => stripCDATA(version?.content), [version?.content]);

  return (
    <ScrollArea className="h-full artifact-sidebar-scrollarea">
      <pre className="artifact-content-default p-4 text-sm whitespace-pre-wrap break-words">
        {cleanDefaultContent || '(Empty)'}
      </pre>
    </ScrollArea>
  );
};

// --- Main Sidebar Component ---

const ArtifactSidebar = ({ widthClass = "md:w-1/2" }) => {
  const isArtifactSidebarOpen = useUIStore(state => state.isArtifactSidebarOpen);
  const activeArtifactId = useUIStore(state => state.activeArtifactId);
  const activeArtifactConversationId = useUIStore(state => state.activeArtifactConversationId);
  const closeArtifactSidebar = useUIStore(state => state.closeArtifactSidebar);
  const switchVersion = useArtifactsStore(state => state.switchActiveArtifactVersion);

  // Memoized selector for the active artifact
  const artifactContainerSelector = useMemo(() => (state) => {
    if (!activeArtifactConversationId || !activeArtifactId) return null;
    // Use getArtifact which returns the container
    return state.getArtifact(activeArtifactConversationId, activeArtifactId);
  }, [activeArtifactConversationId, activeArtifactId]);

  const artifactContainer = useArtifactsStore(artifactContainerSelector);
  const activeVersion = useMemo(() => {
    if (!artifactContainer) return null;
    return artifactContainer.versions.find(v => v.id === artifactContainer.activeVersionId);
  }, [artifactContainer]);

  // State for copy button feedback
  const [copied, setCopied] = useState(false);

  // Get cleaned content of the *active version* for copy/download
  const cleanContent = useMemo(() => stripCDATA(activeVersion?.content), [activeVersion?.content]);

  // --- Version Switching Logic ---
  const currentVersionIndex = useMemo(() => {
    if (!artifactContainer || !activeVersion) return -1;
    return artifactContainer.versions.findIndex(v => v.id === activeVersion.id);
  }, [artifactContainer, activeVersion]);

  const totalVersions = artifactContainer?.versions?.length || 0;
  const canGoPrev = currentVersionIndex > 0;
  const canGoNext = currentVersionIndex < totalVersions - 1;

  const handleSwitchVersion = useCallback((direction) => {
    if (!artifactContainer || currentVersionIndex === -1) return;

    const targetIndex = direction === 'prev' ? currentVersionIndex - 1 : currentVersionIndex + 1;
    if (targetIndex >= 0 && targetIndex < totalVersions) {
      const targetVersionId = artifactContainer.versions[targetIndex].id;
      switchVersion(activeArtifactConversationId, activeArtifactId, targetVersionId);
    }
  }, [artifactContainer, currentVersionIndex, totalVersions, switchVersion, activeArtifactConversationId, activeArtifactId]);
  // --- End Version Switching Logic ---

  // Determine title and icon for the header
  const artifactType = activeVersion?.type || 'unknown';
  const artifactTitle = activeVersion?.metadata?.filename || activeVersion?.metadata?.title || `Artifact (${artifactType})`;
  const Icon = artifactType === 'code' ? CodeIcon : FileText;

  // Determine a suitable filename for download
  const downloadFilename = useMemo(() => {
    if (activeVersion?.metadata?.filename) {
      return activeVersion.metadata.filename;
    }
    const extension = artifactType === 'code'
      ? (activeVersion?.metadata?.language ? `.${activeVersion.metadata.language}` : '.txt')
      : (artifactType === 'html' ? '.html' : '.txt');
    // Include version index in filename if multiple versions exist
    const versionSuffix = totalVersions > 1 ? `_v${currentVersionIndex + 1}` : '';
    return `artifact-${artifactContainer?.id || 'unknown'}${versionSuffix}${extension}`;
  }, [activeVersion, artifactContainer?.id, artifactType, totalVersions, currentVersionIndex]);

  // Determine MIME type for download
  const downloadMimeType = useMemo(() => {
    switch (artifactType) {
      case 'html': return 'text/html';
      case 'json': return 'application/json';
      case 'markdown': return 'text/markdown';
      // Add more specific types if needed
      default: return 'text/plain';
    }
  }, [artifactType]);

  // --- Handlers ---
  const handleCopy = useCallback(() => {
    if (!cleanContent) return;
    navigator.clipboard.writeText(cleanContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(err => console.error("Failed to copy artifact content:", err));
  }, [cleanContent]);

  const handleDownload = useCallback(() => {
    if (!cleanContent) return;
    downloadTextFile(cleanContent, downloadFilename, downloadMimeType);
  }, [cleanContent, downloadFilename, downloadMimeType]);

  return (
    // Sidebar container with transition
    <div className={cn(
      "fixed inset-y-0 right-0 z-40", // z-index lower than potential modals
      "bg-background border-l border-border shadow-lg",
      "flex flex-col",
      // --- Use the passed widthClass and ensure w-full for mobile ---
      "w-full", // Full width by default (mobile)
      widthClass, // Apply desktop width (e.g., md:w-[45%])
      // --- Transition for transform (slide) ---
      "transition-transform duration-300 ease-in-out",
      isArtifactSidebarOpen ? "translate-x-0" : "translate-x-full" // Slide in/out
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border shrink-0 h-14 gap-2">
        {/* Left Side: Title & Streaming Indicator */}
        <div className="flex items-center truncate mr-1">
          <Icon className="h-4 w-4 mr-2 shrink-0" />
          <span className="font-medium truncate" title={artifactTitle}>{artifactTitle}</span>
          {/* Use activeVersion.isComplete */}
          {activeVersion && !activeVersion.isComplete && <span className="text-xs text-muted-foreground ml-2">(Streaming...)</span>}
        </div>
        
        {/* Right Side: Version Switcher & Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Version Switcher (only show if more than 1 version) */}
          {totalVersions > 1 && (
            <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5 mr-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleSwitchVersion('prev')}
                disabled={!canGoPrev}
                className="h-6 w-6"
                title="Previous version"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium text-muted-foreground tabular-nums px-1">
                {currentVersionIndex + 1} / {totalVersions}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleSwitchVersion('next')}
                disabled={!canGoNext}
                className="h-6 w-6"
                title="Next version"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Action Buttons */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy content"}
            disabled={!cleanContent || copied} // Disable if no content or during copied feedback
            className="h-8 w-8"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            <span className="sr-only">Copy</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            title="Download artifact"
            disabled={!cleanContent} // Disable if no content
            className="h-8 w-8"
          >
            <Download className="h-4 w-4" />
            <span className="sr-only">Download</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={closeArtifactSidebar} className="h-8 w-8">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-grow overflow-hidden"> {/* Changed to overflow-hidden */}
        {!activeVersion ? (
          <div className="p-4 text-center text-muted-foreground">Loading artifact...</div>
        ) : (
          <>
            {artifactType === 'code' && <CodeArtifactContent version={activeVersion} />}
            {artifactType === 'html' && <HtmlArtifactContent version={activeVersion} />}
            {artifactType !== 'code' && artifactType !== 'html' && <DefaultArtifactContent version={activeVersion} />}
          </>
        )}
      </div>
    </div>
  );
};

export default ArtifactSidebar;