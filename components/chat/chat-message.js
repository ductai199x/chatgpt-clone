'use client';

import { useState, useCallback, memo } from 'react';

import { User, Bot, Copy, Check, ThumbsUp, ThumbsDown, Trash2, RefreshCw, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import ArtifactDisplay from '@/components/artifacts/artifact-display';
import GeneratedFilesDisplay from '@/components/chat/generated-files-display';
import { useChatStore } from '@/lib/store/chat-store';
import { useSettingsStore } from '@/lib/store/settings-store';
import { cn, formatFileSize } from '@/lib/utils';
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
  const [showReasoning, setShowReasoning] = useState(false);
  const [collapsedCode, setCollapsedCode] = useState({});
  const { interface: interfaceSettings, currentModel } = useSettingsStore();

  const switchActiveMessageBranch = useChatStore(state => state.switchActiveMessageBranch);
  const regenerateResponse = useChatStore(state => state.regenerateResponse);
  const activeConversationId = useChatStore(state => state.activeConversationId);
  const storeIsLoading = useChatStore(state => state.isLoading);

  const {
    id,
    role,
    content,
    createdAt,
    reasoning,
    isReasoningInProgress,
    reasoningDurationMs,
  } = message;


  const handleDelete = useCallback(() => {
    if (window.confirm('Are you sure you want to delete this message and its branch?')) {
      if (activeConversationId) {
        onDeleteMessageBranch(id);
      }
    }
  }, [activeConversationId, id, onDeleteMessageBranch]);

  const handleCopy = useCallback((textToCopy, copyId = 'message') => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(copyId);
      setTimeout(() => setCopied(false), 500);
    });
  }, []);

  const handleFeedback = useCallback((type) => {
    setFeedback(prev => (prev === type ? null : type));
  }, []);

  const toggleCodeCollapse = useCallback((codeId) => {
    setCollapsedCode(prev => ({
      ...prev,
      [codeId]: !prev[codeId]
    }));
  }, []);

  // Get file icon based on category
  const getFileIcon = (category, fileName) => {
    if (category === 'image') return '🖼️';
    const ext = fileName?.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf': return '📄';
      case 'csv': return '📊';
      case 'json': return '📋';
      case 'txt': case 'md': return '📄';
      case 'xlsx': case 'xls': return '📈';
      case 'py': return '🐍';
      case 'js': return '💻';
      default: return '📎';
    }
  };

  // Collapsible code block component
  const CollapsibleCodeBlock = ({ code, label, className = "", codeId, type = "input" }) => {
    const isCollapsed = collapsedCode[codeId];
    const displayCode = isCollapsed ? code.split('\n').slice(0, 3).join('\n') + (code.split('\n').length > 3 ? '\n...' : '') : code;
    const showCollapseButton = code.split('\n').length > 3;
    const copyId = `${codeId}-${type}`;

    return (
      <div className={`collapsible-code-block ${className}`}>
        {label && (
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopy(code, copyId)}
                className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
                title="Copy code"
              >
                {copied === copyId ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                {copied === copyId ? 'Copied!' : 'Copy'}
              </button>
              {showCollapseButton && (
                <button
                  onClick={() => toggleCodeCollapse(codeId)}
                  className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
                  title={isCollapsed ? 'Expand code' : 'Collapse code'}
                >
                  <ChevronDown size={12} className={`transform transition-transform ${isCollapsed ? '' : 'rotate-180'}`} />
                  {isCollapsed ? 'Expand' : 'Collapse'}
                </button>
              )}
            </div>
          </div>
        )}
        <div className={`rounded-md p-2 text-sm ${isCollapsed && showCollapseButton ? 'max-h-20' : 'max-h-64'} overflow-y-auto ${
          type === 'error' ? 'bg-red-900/20' : 'bg-gray-800'
        }`}>
          <pre className={`whitespace-pre-wrap text-xs ${
            type === 'error' ? 'text-red-300' : 'text-green-300'
          }`}>{displayCode}</pre>
        </div>
      </div>
    );
  };

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

  const toggleReasoning = () => setShowReasoning(prev => !prev);

  const formatReasoningDuration = (durationMs) => {
    if (!durationMs) return '';
    const seconds = Math.floor((durationMs / 1000) % 60);
    const minutes = Math.floor((durationMs / (1000 * 60)) % 60);
    let durationStr = '';
    if (minutes > 0) durationStr += `${minutes}m `;
    durationStr += `${seconds}s`;
    return durationStr.trim();
  };

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

  const isThisMessageStreaming = storeIsLoading && role === 'assistant' &&
    (isReasoningInProgress || (content && getRawTextContent(content).trim() === '' && message.hasOwnProperty('reasoning') && (!Array.isArray(reasoning) || reasoning.length === 0)));

  const renderReasoningHeader = () => {
    if (role !== 'assistant') return null;
    if (!Array.isArray(reasoning) || reasoning.length === 0) return null;

    if (isReasoningInProgress) {
      return (
        <button
          onClick={toggleReasoning}
          className="reasoning-header thinking"
          aria-expanded={showReasoning}
        >
          Thinking...
          <ChevronDown className={cn("reasoning-chevron", showReasoning && "rotate-180")} />
        </button>
      );
    }

    // If reasoning is not in progress, but the message is one that *could* have reasoning,
    // show the "Thought for..." or "Thoughts" header.
    // The `reasoning` field might be null or an empty string if the summary was empty or failed.
    const durationText = reasoningDurationMs
      ? `Thought for ${formatReasoningDuration(reasoningDurationMs)}`
      : 'Thoughts'; // Default to "Thoughts" if duration isn't set but reasoning was expected.

    return (
      <button
        onClick={toggleReasoning}
        className="reasoning-header thought-for"
        aria-expanded={showReasoning}
      >
        {durationText}
        <ChevronDown className={cn("reasoning-chevron", showReasoning && "rotate-180")} />
      </button>
    );
  };

  const renderReasoningContent = () => {
    if (role !== 'assistant' || !message.hasOwnProperty('reasoning') || !showReasoning) {
      return null;
    }

    const reasoningSteps = Array.isArray(reasoning) ? reasoning : [];

    if (!isReasoningInProgress && reasoningSteps.length === 0) {
      // This covers cases where reasoning array is empty after finalization.
      // And reasoning was actually attempted (message.hasOwnProperty('reasoning') is true).
      return (
        <div className="reasoning-content prose prose-sm dark:prose-invert max-w-none">
          <p className="text-muted-foreground italic">No reasoning summary available.</p>
        </div>
      );
    }

    const renderToolUseStep = (step, index) => {
      const getToolDisplayName = (toolName) => {
        switch (toolName) {
          case 'web_search': return 'Web Search';
          case 'code_execution': return 'Code Execution';
          default: return toolName;
        }
      };

      const getToolIcon = (toolName) => {
        switch (toolName) {
          case 'web_search': return '🌐';
          case 'code_execution': return '💻';
          default: return '🔧';
        }
      };

      const parseToolInput = (inputString) => {
        try {
          return JSON.parse(inputString || '{}');
        } catch (e) {
          // If parsing fails, return a simple object with the raw string
          return { query: inputString || 'Loading...' };
        }
      };

      const toolInput = parseToolInput(step.input);
      const displayName = getToolDisplayName(step.toolName);
      const icon = getToolIcon(step.toolName);

      const queryValue = toolInput.query || '';
      const codeValue = toolInput.code || '';

      return (
        <div key={`tool-step-${index}`} className="reasoning-step tool-use-step">
          <div className="tool-header flex items-center gap-2 text-sm font-medium text-blue-400 mb-2">
            <span className="tool-icon">{icon}</span>
            <span className="tool-name">{displayName}</span>
            {step.status === 'streaming_input' && (
              <span className="tool-status text-xs text-gray-400">Setting up...</span>
            )}
            {step.status === 'completed' && (
              <span className="tool-status text-xs text-green-400">✓</span>
            )}
          </div>
          
          {/* Show tool input */}
          {(toolInput.query || toolInput.code || step.input) && (
            <div className="tool-input mb-2">
              {step.toolName === 'code_execution' && (toolInput.code || step.input) ? (
                <CollapsibleCodeBlock
                  code={codeValue}
                  label="Code:"
                  codeId={`tool-input-${step.toolId}`}
                  type="input"
                />
              ) : (
                <>
                  <div className="tool-input-label text-xs text-gray-500 mb-1">
                    {step.toolName === 'web_search' ? 'Search Query:' : 'Code:'}
                  </div>
                  <div className="tool-input-content bg-gray-800 rounded-md p-2 text-sm">
                    <span className="text-gray-300">{queryValue || codeValue || getDisplayValue(step.input)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Show tool result */}
          {step.result && step.status === 'completed' && (
            <div className="tool-result">
              <div className="tool-result-label text-xs text-gray-500 mb-1">Result:</div>
              <div className="tool-result-content bg-gray-800 rounded-md p-2 text-sm">
                {step.toolName === 'code_execution' ? (
                  // Handle code execution results specially
                  <div className="code-execution-result">
                    {step.result.stdout && (
                      <div className="mb-2">
                        <CollapsibleCodeBlock
                          code={step.result.stdout}
                          label="Output:"
                          codeId={`tool-output-${step.toolId}`}
                          type="output"
                          className="stdout-output"
                        />
                      </div>
                    )}
                    {step.result.stderr && (
                      <div className="mb-2">
                        <CollapsibleCodeBlock
                          code={step.result.stderr}
                          label="Error:"
                          codeId={`tool-error-${step.toolId}`}
                          type="error"
                          className="stderr-output"
                        />
                      </div>
                    )}
                    <div className="text-xs text-gray-400">
                      Exit code: <span className={step.result.return_code === 0 ? 'text-green-400' : 'text-red-400'}>
                        {step.result.return_code}
                      </span>
                    </div>
                  </div>
                ) : Array.isArray(step.result) ? (
                  // Handle web search results as pills
                  <div className="flex flex-wrap gap-2">
                    {step.result.map((item, resultIndex) => (
                      <div key={resultIndex}>
                        {item.type === 'web_search_result' ? (
                          <button
                            onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                            title={item.title}
                            className="inline-flex items-center px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-full transition-colors duration-200 max-w-xs"
                          >
                            <span className="truncate">{item.title}</span>
                          </button>
                        ) : item.type === 'text' ? (
                          <div className="w-full">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                p: ({ children }) => <p className="mb-1 text-gray-300">{children}</p>,
                                a: ({ children, href }) => (
                                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                                    {children}
                                  </a>
                                ),
                              }}
                            >
                              {item.text}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="text-gray-300 text-xs">
                            {JSON.stringify(item, null, 2)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  // Handle other tool results with markdown
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p className="mb-1 text-gray-300">{children}</p>,
                      a: ({ children, href }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {String(step.result)}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          )}

          {/* Show generated files if any */}
          {step.hasFiles && step.files && (
            <GeneratedFilesDisplay 
              files={step.files} 
              toolId={step.toolId}
            />
          )}
        </div>
      );
    };

    // If reasoning is in progress OR there are steps to show
    if (isReasoningInProgress || reasoningSteps.length > 0) {
      return (
        <div className="reasoning-content"> {/* Main container for reasoning */}
          {reasoningSteps.map((step, index) => {
            if (step.type === 'tool_use') {
              return renderToolUseStep(step, index);
            } else {
              // Handle thinking steps
              return (
                <div key={`reasoning-step-${index}`} className="reasoning-step">
                  <ReactMarkdown
                    // className="prose prose-sm dark:prose-invert max-w-none"
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // Allow normal markdown rendering including lists
                      p: ({ children }) => <p className="mb-2">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
                      li: ({ children }) => <li className="mb-0.5 pl-3">{children}</li>,
                    }}
                  >
                    {step.content ? step.content.trim() : ''}
                  </ReactMarkdown>
                </div>
              );
            }
          })}
          {isReasoningInProgress && reasoningSteps.length === 0 && (
            <div className="reasoning-step text-muted-foreground italic">Loading thoughts...</div>
          )}
        </div>
      );
    }

    // Fallback if for some reason the conditions above aren't met,
    // but we still have `showReasoning` true for an assistant message with reasoning.
    return (
      <div className="reasoning-content prose prose-sm dark:prose-invert max-w-none">
        <p className="text-muted-foreground italic">No reasoning summary available.</p>
      </div>
    );
  };

  const renderContent = () => {
    // Use isThisMessageStreaming for the typing indicator if no content AND no reasoning is in progress yet
    if (isThisMessageStreaming && (!content || getRawTextContent(content).trim() === '') && !isReasoningInProgress && (!Array.isArray(reasoning) || reasoning.length === 0)) {
      return (
        <div className="typing-indicator">
          <span className="typing-dot animate-typing-dot-1"></span>
          <span className="typing-dot animate-typing-dot-2"></span>
          <span className="typing-dot animate-typing-dot-3"></span>
        </div>
      );
    }

    // If reasoning is in progress but there's no main content yet, don't show typing indicator for main content.
    // The "Thinking..." header will serve as the indicator.
    if (isReasoningInProgress && (!content || getRawTextContent(content).trim() === '')) {
      // Potentially render nothing here for main content if only thinking is happening
      // Or a very subtle placeholder if desired. For now, let reasoning header handle it.
    }

    const isStreamingThisMessageMainContent = storeIsLoading && role === 'assistant' && getRawTextContent(content).trim() !== '' && !isReasoningInProgress;
    const markdownContent = getRawTextContent(content);
    const imageParts = Array.isArray(content) ? content.filter(part => part.type === 'image_url') : [];
    const attachmentParts = Array.isArray(content) ? content.filter(part => part.type === 'attachment') : [];

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
        {attachmentParts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachmentParts.map((attachment, index) => (
              <div key={`attachment-${index}`} className="message-attachment-item">
                <div className="file-icon text-lg">{getFileIcon(attachment.category, attachment.fileName)}</div>
                <div className="file-info">
                  <div className="file-name text-sm font-medium" title={attachment.fileName}>
                    {attachment.fileName}
                  </div>
                  <div className="file-size text-xs text-muted-foreground">
                    {formatFileSize(attachment.fileData ? Math.round(attachment.fileData.length * 0.75) : 0)}
                  </div>
                </div>
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
                a({ children, href, ...props }) {
                  // Check if this is a citation link (contains only the globe emoji)
                  const isCitationLink = children && children.toString().trim() === '🔗';
                  
                  if (isCitationLink) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-[0.1] py-[0.1] bg-blue-400 hover:bg-blue-500 text-white text-sm rounded-md transition-colors duration-200 no-underline mr-0.5"
                        title={`Open citation link: ${href}`}
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  }
                  
                  // Regular links with underline
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                      {...props}
                    >
                      {children}
                    </a>
                  );
                },
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
                          onClick={() => handleCopy(codeString, 'markdown-code')}
                        >
                          {copied === 'markdown-code' ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
                          {copied === 'markdown-code' ? 'Copied!' : 'Copy code'}
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
            {isStreamingThisMessageMainContent && <span className="streaming-cursor"></span>}
            {isIncomplete && !isStreamingThisMessageMainContent && <span className="message-incomplete-indicator">(incomplete)</span>}
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

          {/* Render Reasoning Header and Content */}
          {!isUser && renderReasoningHeader()}
          {!isUser && renderReasoningContent()}

          <div>{renderContent()}</div>

          {/* Actions: Conditionally render based on global storeIsLoading */}
          {!storeIsLoading && (
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
                <button onClick={() => handleCopy(rawText, 'message')} title="Copy message">
                  {copied === 'message' ? <Check size={17} className="text-green-500" /> : <Copy size={17} />}
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