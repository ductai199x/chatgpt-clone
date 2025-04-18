'use client';

import { useState, memo } from 'react';
import { User, Bot, Copy, Check, ThumbsUp, ThumbsDown, Trash2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/store/settings-store';
import { useConversationsStore } from '@/lib/store/conversations-store';
import { formatMessageTime } from '@/lib/utils/conversation';
import ArtifactDisplay from '@/components/artifacts/artifact-display';

const ChatMessage = memo(({ 
  message, 
  currentVersionIndex,
  totalVersions,
  canGoPrev,
  canGoNext,
  isLoading, 
  onDeleteMessage 
}) => {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const { interface: interfaceSettings, currentModel } = useSettingsStore();
  const switchActiveMessageVersion = useConversationsStore(state => state.switchActiveMessageVersion);
  const regenerateResponse = useConversationsStore(state => state.regenerateResponse);
  const activeConversationId = useConversationsStore(state => state.activeConversationId);
  
  const { 
    id, 
    versionId, 
    role, 
    content, 
    createdAt 
  } = message;

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this message?' + 
      (role === 'user' ? ' All following responses might also become inaccessible depending on branching.' : ''))) {
      onDeleteMessage(id);
    }
  };
  
  const handleCopy = (textToCopy) => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  
  const handleFeedback = (type) => {
    setFeedback(prev => (prev === type ? null : type));
  };

  const handleSwitchVersion = (direction) => {
    const conversation = useConversationsStore.getState().conversations[activeConversationId];
    const messageNode = conversation?.messages?.[id];

    if (!activeConversationId || !messageNode) return;
    
    const currentIndex = currentVersionIndex; 
    if (currentIndex === -1) return; 

    const targetIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex >= 0 && targetIndex < totalVersions) { 
      const targetVersionId = messageNode.versions[targetIndex].id;
      switchActiveMessageVersion(activeConversationId, id, targetVersionId);
    }
  };

  const handleRegenerate = () => {
    if (!activeConversationId || !id) return;
    regenerateResponse(activeConversationId, id); 
  };

  const isUser = role === 'user';
  const Icon = isUser ? User : Bot;
  const roleName = isUser ? 'You' : 'Assistant';

  const getRawTextContent = (msgContent) => {
    if (typeof msgContent === 'string') {
      return msgContent;
    } else if (Array.isArray(msgContent)) {
      return msgContent
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n\n');
    }
    return '';
  };
  const rawText = getRawTextContent(content);

  const renderContent = () => {
    if (isLoading && (!content || getRawTextContent(content).trim() === '')) {
      return (
        <div className="typing-indicator">
          <span className="typing-dot animate-typing-dot-1"></span>
          <span className="typing-dot animate-typing-dot-2"></span>
          <span className="typing-dot animate-typing-dot-3"></span>
        </div>
      );
    } 

    const isStreamingThisMessage = isLoading && role === 'assistant' && getRawTextContent(content).trim() !== '';
    
    const markdownContent = getRawTextContent(content);
    const imageParts = Array.isArray(content) ? content.filter(part => part.type === 'image') : [];
    const rehypePlugins = isUser ? [] : [rehypeRaw]; // Only use rehypeRaw for assistant messages

    return (
      <>
        {imageParts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {imageParts.map((part, index) => (
              <div key={`img-${index}`} className="message-image-wrapper">
                <img
                  src={part.imageUrl}
                  alt="Uploaded content"
                  className="message-image"
                />
              </div>
            ))}
          </div>
        )}
        {markdownContent && (
          <div className="message-text-content prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={rehypePlugins}
              components={{
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeString = String(children).replace(/\n$/, '');
                  
                  return !inline ? (
                    <pre className="code-block group/code !p-0 !m-0 !bg-transparent !font-sans">
                      <div className="code-header">
                        <span className="language">{match?.[1] || 'code'}</span>
                        <button
                          className="flex items-center gap-1.5 text-xs hover:text-foreground p-1 -m-1 rounded opacity-0 group-hover/code:opacity-100 transition-opacity"
                          onClick={() => handleCopy(codeString)}
                        >
                          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                          {copied ? 'Copied!' : 'Copy code'}
                        </button>
                      </div>
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match?.[1]}
                        PreTag="div"
                        className="!p-4 !m-0 rounded-b-md"
                        {...props}
                      >
                        {codeString}
                      </SyntaxHighlighter>
                    </pre>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                // --- FINAL REVISED 'p' renderer ---
                p({ node, children, ...props }) {
                  // Check if any child node is an element that is NOT a known safe inline tag.
                  // This handles cases where rehype-raw allows tags like <artifact> or others.
                  const containsBlockOrUnknownElement = node.children.some(child => {
                      if (child.type !== 'element') return false; // Ignore text nodes

                      // List known SAFE inline tags that are okay inside <p>
                      const safeInlineTags = ['a', 'abbr', 'b', 'br', 'cite', 'code', 'em', 'i', 'img', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var'];

                      // If the tag is NOT in the safe list, assume it might be block-level
                      // or contain block-level elements (like <pre> or <div>).
                      return !safeInlineTags.includes(child.tagName);
                  });

                  if (containsBlockOrUnknownElement) {
                      // If it contains a block or potentially block element,
                      // render children directly using a Fragment to avoid invalid nesting.
                      return <>{children}</>;
                  }

                  // Otherwise, it's safe to render a standard paragraph
                  return <p className="mb-2 last:mb-0" {...props}>{children}</p>;
                },
                artifactrenderer(props) {
                  const { node } = props;
                  const artifactId = node?.properties?.id;

                  if (!artifactId) {
                    console.warn("ArtifactRenderer tag found without an ID attribute.");
                    return <div className="text-red-500 text-xs">[Invalid Artifact Placeholder]</div>;
                  }

                  return <ArtifactDisplay artifactId={artifactId} />;
                }
              }}
            >
              {markdownContent}
            </ReactMarkdown>
            {isStreamingThisMessage && (
              <span className="streaming-cursor"></span>
            )}
          </div>
        )}
      </>
    );
  };
  
  return (
    <div className={cn('message-bubble group', role)}> 
      <div className="message-bubble-content">
        <div className={cn('message-icon', role)}>
          <Icon size={18} />
        </div>
        
        <div className="message-main">
          <div className="message-metadata">
            <span className="role">{roleName}</span>
            {!isUser && interfaceSettings.showModelName && (
              <span className="model">{currentModel}</span>
            )}
            {interfaceSettings.showTimestamps && (
              <span className="timestamp">{formatMessageTime(createdAt)}</span>
            )}
          </div>
          
          <div>{renderContent()}</div>

          {!isLoading && (
            <div className="message-actions group-hover:opacity-100">
              {!isUser && totalVersions > 1 && (
                <div className="message-version-nav">
                  <button onClick={() => handleSwitchVersion('prev')} disabled={!canGoPrev}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span className="sr-only">Previous version</span>
                  </button>
                  <span>{currentVersionIndex + 1}/{totalVersions}</span>
                  <button onClick={() => handleSwitchVersion('next')} disabled={!canGoNext}>
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span className="sr-only">Next version</span>
                  </button>
                </div>
              )}

              {!isUser && rawText && (
                 <button onClick={() => handleCopy(rawText)} title="Copy message">
                   {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                   <span className="sr-only">Copy</span>
                 </button>
              )}

              {!isUser && (
                <button 
                  onClick={handleRegenerate} 
                  title="Regenerate response"
                  disabled={useConversationsStore.getState().isLoading}
                >
                  <RefreshCw size={14} />
                  <span className="sr-only">Regenerate</span>
                </button>
              )}
              
              {!isUser && (
                <>
                  <button 
                    onClick={() => handleFeedback('like')} 
                    title="Good response"
                    className={cn(feedback === 'like' && 'text-green-500 bg-accent')}
                  >
                    <ThumbsUp size={14} />
                    <span className="sr-only">Like</span>
                  </button>
                  <button 
                    onClick={() => handleFeedback('dislike')} 
                    title="Bad response"
                    className={cn(feedback === 'dislike' && 'text-red-500 bg-accent')}
                  >
                    <ThumbsDown size={14} />
                    <span className="sr-only">Dislike</span>
                  </button>
                </>
              )}

              <button onClick={handleDelete} title="Delete message" className="hover:text-destructive">
                <Trash2 size={14} />
                <span className="sr-only">Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

ChatMessage.displayName = 'ChatMessage';

export default ChatMessage;