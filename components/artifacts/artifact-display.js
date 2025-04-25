'use client';

import React, { useMemo } from 'react';
import { Code, FileText, PanelRightOpen, Link as LinkIcon } from 'lucide-react'; // Example icons
import { useChatStore } from '@/lib/store/chat-store';
import { useUIStore } from '@/lib/store/ui-store';
import { cn } from '@/lib/utils';

// Helper to get an appropriate icon based on artifact type
const getArtifactIcon = (type) => {
  switch (type) {
    case 'code':
      return <Code className="h-4 w-4 mr-2" />;
    case 'html':
      return <FileText className="h-4 w-4 mr-2" />; // Example, choose appropriate icon
    // Add more cases as needed
    default:
      return <FileText className="h-4 w-4 mr-2" />;
  }
};

const ArtifactDisplay = ({ artifactId }) => {
  const conversationId = useChatStore(state => state.activeConversationId);
  const artifactNode = useChatStore(state => state.getArtifactNode(conversationId, artifactId));
  const openArtifactSidebar = useUIStore(state => state.openArtifactSidebar);
  const requestReferenceInsert = useUIStore(state => state.requestReferenceInsert); // <-- Get new action

  const handleOpenSidebar = (e) => {
    // Prevent triggering if clicking the reference button itself
    if (e.target.closest('.artifact-reference-button')) return;

    if (artifactId && conversationId) {
      openArtifactSidebar(artifactId, conversationId);
    } else {
      console.error("Cannot open artifact sidebar: missing artifactId or conversationId");
    }
  };

  const handleReferenceClick = (e) => {
    e.stopPropagation();
    if (artifactId) {
      requestReferenceInsert(artifactId); // <-- Use action from UI Store
    }
  };

  // Memoize derived values for display
  const { artifactType, artifactTitle, Icon, isComplete } = useMemo(() => {
    const type = artifactNode?.metadata?.type || 'unknown';
    const title = artifactNode?.metadata?.filename || artifactNode?.metadata?.title || `Artifact (${artifactId.slice(0, 6)})`;
    const icon = getArtifactIcon(type);
    const complete = artifactNode?.isComplete ?? true; // Default to true if node not found yet
    return { artifactType: type, artifactTitle: title, Icon: icon, isComplete: complete };
  }, [artifactNode, artifactId]);

  if (!artifactNode) {
    // Render a disabled placeholder if artifact data isn't found (yet or error)
    return (
      <div className="artifact-placeholder my-2 p-2 border rounded-md bg-muted text-muted-foreground text-sm flex items-center justify-between opacity-50 cursor-not-allowed">
        <span>Loading Artifact...</span>
        <FileText className="h-4 w-4 ml-2" />
      </div>
    );
  }

  return (
    <div
      id={`artifact-${artifactId}`}
      className={cn(
        "artifact-placeholder my-2 w-full justify-start h-auto py-1.5 px-3", // Base button styles
        "inline-flex items-center relative", // Flex layout
        "border rounded-md bg-background hover:bg-muted", // Appearance
        "text-sm cursor-pointer transition-colors" // Text & interaction
      )}
      onClick={handleOpenSidebar} // Click anywhere *except* reference button opens sidebar
      title={`View artifact: ${artifactTitle}`}
    >
      {/* Left side: Icon and Title */}
      <div className="flex items-center flex-grow min-w-0 mr-2"> {/* Allow shrinking */}
        <span className="mr-2">{Icon}</span> {/* Icon with margin */}
        <span className="flex-grow text-left truncate mr-2">{artifactTitle}</span>
        {!isComplete && <span className="text-xs text-muted-foreground mr-2 flex-shrink-0">(Streaming...)</span>}
      </div>

      {/* Right side: Action Icons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Reference Button */}
        <button
          type="button"
          onClick={handleReferenceClick}
          className="artifact-reference-button p-1 rounded hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Reference this artifact: ${artifactTitle}`}
          title={`Reference this artifact: ${artifactTitle}`}
        >
          <LinkIcon className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Sidebar Indicator */}
        <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
};

// Keep memoization
export default React.memo(ArtifactDisplay);