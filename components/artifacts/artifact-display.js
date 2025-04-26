'use client';

import React, { useMemo } from 'react';
import { Code, FileText, PanelRightOpen, Link as LinkIcon } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { useUIStore } from '@/lib/store/ui-store';

// Helper to get an appropriate icon based on artifact type (no margin)
const getArtifactIcon = (type) => {
  switch (type) {
    case 'code':
      return <Code className="h-4 w-4" />;
    case 'html':
      return <FileText className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

const ArtifactDisplay = ({ artifactId }) => {
  const conversationId = useChatStore(state => state.activeConversationId);
  const artifactNode = useChatStore(state => state.getArtifactNode(conversationId, artifactId));
  const openArtifactSidebar = useUIStore(state => state.openArtifactSidebar);
  const requestReferenceInsert = useUIStore(state => state.requestReferenceInsert);

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
      requestReferenceInsert(artifactId);
    }
  };

  // Memoize derived values for display
  const { artifactType, artifactTitle, Icon, isComplete } = useMemo(() => {
    const type = artifactNode?.metadata?.type || 'unknown';
    const title = artifactNode?.metadata?.filename || artifactNode?.metadata?.title || `Artifact (${artifactId.slice(0, 6)})`;
    const icon = getArtifactIcon(type);
    const complete = artifactNode?.isComplete ?? true;
    return { artifactType: type, artifactTitle: title, Icon: icon, isComplete: complete };
  }, [artifactNode, artifactId]);

  if (!artifactNode) {
    // Render a disabled placeholder if artifact data isn't found
    return (
      <div className="artifact-loading-placeholder">
        <span>Loading Artifact...</span>
        <FileText className="h-4 w-4 ml-2" />
      </div>
    );
  }

  return (
    <div
      id={`artifact-${artifactId}`}
      className="artifact-display-container"
      onClick={handleOpenSidebar}
      title={`View artifact: ${artifactTitle}`}
    >
      {/* Left side: Icon and Title */}
      <div className="artifact-display-main">
        <span className="mr-2 flex-shrink-0">{Icon}</span>
        <span className="artifact-display-title">{artifactTitle}</span>
        {!isComplete && <span className="artifact-display-streaming">(Streaming...)</span>}
      </div>

      {/* Right side: Action Icons */}
      <div className="artifact-display-actions">
        {/* Reference Button */}
        <button
          type="button"
          onClick={handleReferenceClick}
          className="artifact-reference-button artifact-display-reference-button"
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

export default React.memo(ArtifactDisplay);