'use client';

import { useState, useCallback, memo } from 'react';
import { User, Bot, Copy, Check, ThumbsUp, ThumbsDown, Trash2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/store/settings-store';
import { useChatStore } from '@/lib/store/chat-store';
import { formatMessageTime } from '@/lib/utils/chat';
import ArtifactDisplay from '@/components/artifacts/artifact-display';
import { visit } from 'unist-util-visit';
import 'katex/dist/katex.min.css';

function remarkInspectAst() {
  return (tree) => {
    console.log('[AST Inspector] Running...'); // Log that the plugin runs
    visit(tree, (node) => {
      if (node.type === 'math' || node.type === 'inlineMath') {
        // If this logs, remark-math worked!
        console.log('[AST Inspector] Found Math Node:', node);
      }
    });
  };
}

const ChatMessage = memo(({
  message,
  // --- UPDATE: Receive branching props ---
  parentId,
  currentBranchIndex,
  totalBranches,
  childrenIds,
  isLoading, // Still needed for visual cues on this specific message
  isIncomplete, // Added to show incomplete status
  onDeleteMessageBranch // Updated action name
}) => {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const { interface: interfaceSettings, currentModel } = useSettingsStore();

  const switchActiveMessageBranch = useChatStore(state => state.switchActiveMessageBranch);
  const regenerateResponse = useChatStore(state => state.regenerateResponse);
  const activeConversationId = useChatStore(state => state.activeConversationId);
  const storeIsLoading = useChatStore(state => state.isLoading); // Global loading state

  const {
    id,
    role,
    content,
    createdAt
  } = message;

  const handleDelete = useCallback(() => {
    if (window.confirm('Are you sure you want to delete this message and its branch?')) {
      if (activeConversationId) {
        onDeleteMessageBranch(id); // Pass only the message ID to delete
      }
    }
  }, [activeConversationId, id, onDeleteMessageBranch]);

  const handleCopy = useCallback((textToCopy) => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []); // Added dependency array

  const handleFeedback = useCallback((type) => {
    setFeedback(prev => (prev === type ? null : type));
  }, []); // Added dependency array

  // --- UPDATE: Handle switching branches ---
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
    regenerateResponse(activeConversationId, id); // Pass message ID to regenerate
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
      // --- Step 0: Unescape ALL existing escaped pipes ---
      text = text.replace(/\\\|/g, '|');

      // --- Step 1: Convert Math Delimiters ---
      // Replace \( with $ and \) with $
      text = text.replace(/\\\(/g, '$').replace(/\\\)/g, '$');
      // Replace \[ with $$ and \] with $$ (using $$$$ for literal $$)
      text = text.replace(/\\\[/g, '$$$$').replace(/\\\]/g, '$$$$');

      // --- Step 2: Escape '|' ONLY inside math delimiters (Line by Line) ---
      const lines = text.split('\n');
      const processedLines = lines.map(line => {
        let processedLine = line;

        // Pass 2a: Handle display math $$...$$ on this line
        processedLine = processedLine.replace(/(\$\$)([\s\S]*?)(\$\$)/g, (match, delim, content) => {
          const escapedContent = content.replace(/(?<!\\)\|/g, '\\|');
          return delim + escapedContent + delim;
        });

        // Pass 2b: Handle inline math $...$ on this line
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
    const rehypePlugins = isUser ? [] : [rehypeKatex, rehypeRaw];

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
              remarkPlugins={remarkPlugins}
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

                  // console.log(`[ChatMessage] artifactrenderer override called. Node:`, node, `Extracted ID: ${artifactId}`);

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
            {isIncomplete && !isStreamingThisMessage && <span className="text-xs text-orange-500 ml-1">(incomplete)</span>}
          </div>
        )}
      </>
    );
  };

  // --- UPDATE: Branch switching logic ---
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

          {/* --- UPDATE: Show actions only when NOT loading this specific message --- */}
          {!isLoading && (
            <div className="message-actions group-hover:opacity-100">
              {/* --- UPDATE: Branch Navigation --- */}
              {!isUser && totalBranches > 1 && (
                <div className="message-version-nav">
                  <button onClick={() => handleSwitchBranch('prev')} disabled={!canGoPrevBranch}>
                    <ChevronLeft className="h-3.5 w-3.5" /> <span className="sr-only">Previous response</span>
                  </button>
                  <span>{currentBranchIndex + 1}/{totalBranches}</span>
                  <button onClick={() => handleSwitchBranch('next')} disabled={!canGoNextBranch}>
                    <ChevronRight className="h-3.5 w-3.5" /> <span className="sr-only">Next response</span>
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
                <button onClick={handleRegenerate} title="Regenerate response" disabled={storeIsLoading}>
                  <RefreshCw size={14} /> <span className="sr-only">Regenerate</span>
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

              <button onClick={handleDelete} title="Delete message branch" className="hover:text-destructive">
                <Trash2 size={14} /> <span className="sr-only">Delete</span>
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