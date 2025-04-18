'use client';

import React, { useState, useMemo } from 'react';
import { useUIStore } from '@/lib/store/ui-store';
import { useArtifactsStore } from '@/lib/store/artifacts-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Copy, Check, Code as CodeIcon, FileText } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'; // Or your preferred theme
import { cn } from '@/lib/utils';

// --- Artifact Content Renderers ---

const CodeArtifactContent = ({ artifact }) => {
  const [copied, setCopied] = useState(false);
  const codeString = artifact.content || '';

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <ScrollArea className="h-full artifact-sidebar-scrollarea">
      <div className="artifact-content-code relative group/code">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover/code:opacity-100 transition-opacity"
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
        <SyntaxHighlighter
          language={artifact.metadata?.language || 'text'} // Default to text if language unknown
          style={vscDarkPlus}
          className="!m-0 !p-4 text-sm rounded-b-md" // Override default styles
          customStyle={{ background: 'hsl(var(--muted))' }} // Use theme background
          showLineNumbers={true} // Optional: show line numbers
          wrapLines={true}
          wrapLongLines={true}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    </ScrollArea>
  );
};

const HtmlArtifactContent = ({ artifact }) => {
  // WARNING: dangerouslySetInnerHTML is risky. Consider a sandboxed iframe for production.
  // For now, we'll use it for simplicity.
  return (
    <div className="artifact-content-html p-4">
      <iframe
        srcDoc={artifact.content || '<p>(Empty HTML)</p>'}
        sandbox="allow-scripts allow-same-origin" // Basic sandboxing
        className="w-full h-[calc(100vh-150px)] border-none rounded" // Adjust height as needed
        title={`HTML Artifact: ${artifact.id}`}
      />
       {/* Fallback if iframe fails or for simpler display:
       <div dangerouslySetInnerHTML={{ __html: artifact.content || '<p>(Empty HTML)</p>' }} />
       */}
    </div>
  );
};

const DefaultArtifactContent = ({ artifact }) => {
  // Simple preformatted text for unknown types
  return (
    <ScrollArea className="h-full artifact-sidebar-scrollarea">
      <pre className="artifact-content-default p-4 text-sm whitespace-pre-wrap break-words">
        {artifact.content || '(Empty)'}
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

  // Determine title and icon for the header
  const artifactTitle = artifact?.metadata?.filename || artifact?.metadata?.title || `Artifact`;
  const artifactType = artifact?.type || 'unknown';
  const Icon = artifactType === 'code' ? CodeIcon : FileText;

  // Render nothing if the sidebar is closed
  // if (!isArtifactSidebarOpen) {
  //   return null;
  // }

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
        <Button variant="ghost" size="icon" onClick={closeArtifactSidebar} className="h-8 w-8">
          <X className="h-4 w-4" />
          <span className="sr-only">Close Artifact Sidebar</span>
        </Button>
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