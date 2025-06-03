'use client';

import { useState, useCallback, memo } from 'react';

import { User, Bot, Copy, Check, ThumbsUp, ThumbsDown, Trash2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import ArtifactDisplay from '@/components/artifacts/artifact-display';
import { useChatStore } from '@/lib/store/chat-store';
import { useSettingsStore } from '@/lib/store/settings-store';
import { cn } from '@/lib/utils';
import { formatMessageTime } from '@/lib/utils/chat';

const ChatMessage = memo(({
  message,
  parentId,
  currentBranchIndex,
  totalBranches,
  childrenIds,
  isLoading,
  isIncomplete,
  onDeleteMessageBranch
}) => {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const { interface: interfaceSettings, currentModel } = useSettingsStore();

  const switchActiveMessageBranch = useChatStore(state => state.switchActiveMessageBranch);
  const regenerateResponse = useChatStore(state => state.regenerateResponse);
  const activeConversationId = useChatStore(state => state.activeConversationId);
  const storeIsLoading = useChatStore(state => state.isLoading);

  const {
    id,
    role,
    content,
    createdAt
  } = message;

  const handleDelete = useCallback(() => {
    if (window.confirm('Are you sure you want to delete this message and its branch?')) {
      if (activeConversationId) {
        onDeleteMessageBranch(id);
      }
    }
  }, [activeConversationId, id, onDeleteMessageBranch]);

  const handleCopy = useCallback((textToCopy) => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 500);
    });
  }, []);

  const handleFeedback = useCallback((type) => {
    setFeedback(prev => (prev === type ? null : type));
  }, []);

  const handleSwitchBranch = useCallback((direction) => {
    if (!activeConversationId || !parentId || currentBranchIndex === -1) return;

    const targetIndex = direction === 'prev' ? currentBranchIndex - 1 : currentBranchIndex + 1;
    if (targetIndex >= 0 && targetIndex < totalBranches) {
      const targetChildId = childrenIds[targetIndex];
      switchActiveMessageBranch(activeConversationId, parentId, targetChildId);
    }
  }, [activeConversationId, parentId, childrenIds, currentBranchIndex, totalBranches, switchActiveMessageBranch]);

  const handleRegenerate = useCallback(() => {
    if (!activeConversationId || !id) return;
    regenerateResponse(activeConversationId, id);
  }, [activeConversationId, id, regenerateResponse]);

  const isUser = role === 'user';
  const Icon = isUser ? User : Bot;
  const roleName = isUser ? 'You' : 'Assistant';

  const getRawTextContent = (msgContent) => {
    let text = '';
    if (typeof msgContent === 'string') {
      text = msgContent;
    } else if (Array.isArray(msgContent)) {
      text = msgContent
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n\n');
    }

    if (text) {
      text = text.replace(/\\\|/g, '|');
      text = text.replace(/\\\(/g, '$').replace(/\\\)/g, '$');
      text = text.replace(/\\\[/g, '$$$$').replace(/\\\]/g, '$$$$');

      const lines = text.split('\n');
      const processedLines = lines.map(line => {
        let processedLine = line;

        processedLine = processedLine.replace(/(\$\$)([\s\S]*?)(\$\$)/g, (match, delim, content) => {
          const escapedContent = content.replace(/(?<!\\)\|/g, '\\|');
          return delim + escapedContent + delim;
        });

        processedLine = processedLine.replace(/(?<!\$)\$(?!\$)([\s\S]*?)(?<!\$)\$(?!\$)/g, (match, content) => {
          const escapedContent = content.replace(/(?<!\\)\|/g, '\\|');
          return '$' + escapedContent + '$';
        });

        return processedLine;
      });

      text = processedLines.join('\n');
    }

    return text;
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
    const imageParts = Array.isArray(content) ? content.filter(part => part.type === 'image_url') : [];

    const remarkPlugins = [remarkGfm, remarkMath];
    const rehypePlugins = [
      [rehypeKatex, { strict: false }],
      rehypeRaw
    ];

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
          <div className="message-text-content">
            <ReactMarkdown
              remarkPlugins={remarkPlugins}
              rehypePlugins={rehypePlugins}
              components={{
                code({ node, inline, className, children, ...props }) {
                  const isBlockCode = className && className.startsWith('language-');
                  if (!isBlockCode) {
                    return (
                      <span
                        className={cn("inline-code-custom bg-muted/40 text-orange-300 px-1 py-0.5 rounded-sm font-mono text-sm", className)}
                        {...props}
                      >
                        {children}
                      </span>
                    );
                  }

                  // Handle block code (```) using SyntaxHighlighter (existing logic)
                  const match = /language-(\w+)/.exec(className || '');
                  const codeString = String(children).replace(/\n$/, '');
                  return (
                    <pre className="code-block group/code">
                      <div className="code-header">
                        <span className="language">{match?.[1] || 'code'}</span>
                        <button
                          className="code-header-button group-hover/code:opacity-100"
                          onClick={() => handleCopy(codeString)}
                        >
                          {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
                          {copied ? 'Copied!' : 'Copy code'}
                        </button>
                      </div>
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match?.[1]}
                        PreTag="div"
                        {...props}
                      >
                        {codeString}
                      </SyntaxHighlighter>
                    </pre>
                  );
                },
                p({ node, children, ...props }) {
                  const containsBlockOrUnknownElement = node.children.some(child => {
                    if (child.type !== 'element') return false;

                    const safeInlineTags = ['a', 'abbr', 'b', 'br', 'cite', 'code', 'em', 'i', 'img', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var'];

                    return !safeInlineTags.includes(child.tagName);
                  });

                  if (containsBlockOrUnknownElement) {
                    return <>{children}</>;
                  }

                  return <p className="markdown-paragraph" {...props}>{children}</p>;
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
            {isStreamingThisMessage && <span className="streaming-cursor"></span>}
            {isIncomplete && !isStreamingThisMessage && <span className="message-incomplete-indicator">(incomplete)</span>}
          </div>
        )}
      </>
    );
  };

  const canGoPrevBranch = currentBranchIndex > 0;
  const canGoNextBranch = currentBranchIndex < totalBranches - 1;

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
              {!isUser && totalBranches > 1 && (
                <div className="message-version-nav">
                  <button onClick={() => handleSwitchBranch('prev')} disabled={!canGoPrevBranch}>
                    <ChevronLeft className="h-5 w-5" /> <span className="sr-only">Previous response</span>
                  </button>
                  <span>{currentBranchIndex + 1}/{totalBranches}</span>
                  <button onClick={() => handleSwitchBranch('next')} disabled={!canGoNextBranch}>
                    <ChevronRight className="h-5 w-5" /> <span className="sr-only">Next response</span>
                  </button>
                </div>
              )}

              {!isUser && rawText && (
                <button onClick={() => handleCopy(rawText)} title="Copy message">
                  {copied ? <Check size={17} className="text-green-500" /> : <Copy size={17} />}
                  <span className="sr-only">Copy</span>
                </button>
              )}

              {!isUser && (
                <button onClick={handleRegenerate} title="Regenerate response" disabled={storeIsLoading}>
                  <RefreshCw size={17} /> <span className="sr-only">Regenerate</span>
                </button>
              )}

              {!isUser && (
                <>
                  <button
                    onClick={() => handleFeedback('like')}
                    title="Good response"
                    className={cn(feedback === 'like' && 'text-green-500 bg-accent')}
                  >
                    <ThumbsUp size={17} />
                    <span className="sr-only">Like</span>
                  </button>
                  <button
                    onClick={() => handleFeedback('dislike')}
                    title="Bad response"
                    className={cn(feedback === 'dislike' && 'text-red-500 bg-accent')}
                  >
                    <ThumbsDown size={17} />
                    <span className="sr-only">Dislike</span>
                  </button>
                </>
              )}

              <button onClick={handleDelete} title="Delete message branch" className="hover:text-destructive">
                <Trash2 size={17} /> <span className="sr-only">Delete</span>
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