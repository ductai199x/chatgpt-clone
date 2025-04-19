'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { useArtifactsStore } from '@/lib/store/artifacts-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Copy, Check, Code as CodeIcon, FileText, Download } from 'lucide-react';
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

const CodeArtifactContent = ({ artifact }) => {
  const cleanCodeString = useMemo(() => stripCDATA(artifact.content), [artifact.content]);

  return (
    <ScrollArea className="h-full artifact-sidebar-scrollarea">
      {/* Removed relative positioning and copy button */}
      <div className="artifact-content-code">
        <SyntaxHighlighter
          language={artifact.metadata?.language || 'text'}
          style={vscDarkPlus}
          className="!m-0 !p-4 text-sm rounded-b-md"
          customStyle={{ background: 'hsl(var(--muted))' }}
          showLineNumbers={true}
          wrapLines={true}
          wrapLongLines={true}
        >
          {cleanCodeString}
        </SyntaxHighlighter>
      </div>
    </ScrollArea>
  );
};

const HtmlArtifactContent = ({ artifact }) => {
  // WARNING: dangerouslySetInnerHTML is risky. Consider a sandboxed iframe for production.
  // For now, we'll use it for simplicity.
  const cleanHtmlContent = useMemo(() => stripCDATA(artifact.content), [artifact.content]);

  return (
    <div className="artifact-content-html p-4">
      <iframe
        srcDoc={cleanHtmlContent || '<p>(Empty HTML)</p>'}
        sandbox="allow-scripts allow-same-origin" // Basic sandboxing
        className="w-full h-[calc(100vh-150px)] border-none rounded" // Adjust height as needed
        title={`HTML Artifact: ${artifact.metadata?.filename || artifact.metadata?.title || `Artifact (${artifact.type})`}`}
      />
      {/* Fallback if iframe fails or for simpler display:
       <div dangerouslySetInnerHTML={{ __html: artifact.content || '<p>(Empty HTML)</p>' }} />
       */}
    </div>
  );
};

const DefaultArtifactContent = ({ artifact }) => {
  // Simple preformatted text for unknown types
  const cleanDefaultContent = useMemo(() => stripCDATA(artifact.content), [artifact.content]);

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

  // Memoized selector for the active artifact
  const artifactSelector = useMemo(() => (state) => {
    if (!activeArtifactConversationId || !activeArtifactId) return null;
    return state.artifactsByConversation[activeArtifactConversationId]?.[activeArtifactId];
  }, [activeArtifactConversationId, activeArtifactId]);

  const artifact = useArtifactsStore(artifactSelector);

  // State for copy button feedback
  const [copied, setCopied] = useState(false);

  // Get cleaned content for copy/download
  const cleanContent = useMemo(() => stripCDATA(artifact?.content), [artifact?.content]);

  // Determine title and icon for the header
  const artifactType = artifact?.type || 'unknown';
  const artifactTitle = artifact?.metadata?.filename || artifact?.metadata?.title || `Artifact (${artifactType})`;
  const Icon = artifactType === 'code' ? CodeIcon : FileText;

  // Determine a suitable filename for download
  const downloadFilename = useMemo(() => {
    if (artifact?.metadata?.filename) {
      return artifact.metadata.filename;
    }
    const extension = artifactType === 'code'
      ? (artifact.metadata?.language ? `.${artifact.metadata.language}` : '.txt') // Basic extension mapping
      : (artifactType === 'html' ? '.html' : '.txt');
    return `artifact-${artifact?.id || 'unknown'}${extension}`;
  }, [artifact]);

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
    }).catch(err => {
      console.error("Failed to copy artifact content:", err);
      // Optionally show error feedback to user
    });
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
      <div className="flex items-center justify-between p-3 border-b border-border shrink-0 h-14">
        <div className="flex items-center truncate">
          <Icon className="h-4 w-4 mr-2 shrink-0" />
          <span className="font-medium truncate" title={artifactTitle}>{artifactTitle}</span>
          {artifact && !artifact.isComplete && <span className="text-xs text-muted-foreground ml-2">(Streaming...)</span>}
        </div>
        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
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
        {!artifact ? (
          <div className="p-4 text-center text-muted-foreground">Loading artifact...</div>
        ) : (
          <>
            {artifactType === 'code' && <CodeArtifactContent artifact={artifact} />}
            {artifactType === 'html' && <HtmlArtifactContent artifact={artifact} />}
            {artifactType !== 'code' && artifactType !== 'html' && <DefaultArtifactContent artifact={artifact} />}
          </>
        )}
      </div>
    </div>
  );
};

export default ArtifactSidebar;