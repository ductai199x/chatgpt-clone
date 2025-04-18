'use client';

import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Code, FileText, PanelRightOpen } from 'lucide-react'; // Example icons
import { useArtifactsStore } from '@/lib/store/artifacts-store';
import { useConversationsStore } from '@/lib/store/conversations-store';
import { useUIStore } from '@/lib/store/ui-store';

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
  const conversationId = useConversationsStore(state => state.activeConversationId);
  // --- Get the action from the UI store ---
  const openArtifactSidebar = useUIStore(state => state.openArtifactSidebar);

  // Memoized selector to get the specific artifact and react to its changes
  // We still need this to display basic info on the button/placeholder
  const artifactSelector = useMemo(() => (state) => {
    if (!conversationId || !artifactId) return null;
    return state.artifactsByConversation[conversationId]?.[artifactId];
  }, [conversationId, artifactId]);

  const artifact = useArtifactsStore(artifactSelector);
  console.log("ArtifactDisplay: artifactId", artifactId, "artifact", artifact);

  // --- Handle click: Call the UI store action ---
  const handleClick = () => {
    if (artifactId && conversationId) {
      openArtifactSidebar(artifactId, conversationId);
    } else {
      console.error("Cannot open artifact sidebar: missing artifactId or conversationId");
    }
  };

  if (!artifact) {
    // Render a disabled placeholder if artifact data isn't found (yet or error)
    return (
      <div className="artifact-placeholder my-2 p-2 border rounded-md bg-muted text-muted-foreground text-sm flex items-center justify-between opacity-50 cursor-not-allowed">
        <span>Loading Artifact...</span>
        <FileText className="h-4 w-4 ml-2" />
      </div>
    );
  }

  // --- Render the clickable placeholder ---
  const artifactTitle = artifact.metadata?.filename || artifact.metadata?.title || `Artifact (${artifact.type})`;
  const Icon = getArtifactIcon(artifact.type);

  return (
    <Button
      variant="outline"
      size="sm"
      className="artifact-placeholder my-2 w-full justify-start h-auto py-2 px-3" // Adjust styling as needed
      onClick={handleClick}
      title={`Open artifact: ${artifactTitle}`}
    >
      {Icon}
      <span className="flex-grow text-left truncate mr-2">{artifactTitle}</span>
      {!artifact.isComplete && <span className="text-xs text-muted-foreground mr-2">(Streaming...)</span>}
      <PanelRightOpen className="h-4 w-4 text-muted-foreground" /> {/* Icon indicating sidebar open */}
    </Button>
  );
};

// Keep memoization
export default React.memo(ArtifactDisplay);