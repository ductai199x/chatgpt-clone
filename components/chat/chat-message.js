'use client';

import { useState } from 'react';
import { User, Bot, Copy, Check, ThumbsUp, ThumbsDown, Trash2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/store/settings-store';
import { useConversationsStore } from '@/lib/store/conversations-store';
import { formatDate, formatMessageTime } from '@/lib/utils/conversation';

export default function ChatMessage({ 
  message, 
  currentVersionIndex,
  totalVersions,
  canGoPrev,
  canGoNext,
  isLoading, 
  onDeleteMessage 
}) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const { interface: interfaceSettings, currentModel } = useSettingsStore();
  const { 
    switchActiveMessageVersion, 
    regenerateResponse
  } = useConversationsStore(); 
  
  const { 
    id, 
    versionId, 
    role, 
    content, 
    createdAt 
  } = message;

  console.log(`[ChatMessage Render] ID: ${id}, VersionID: ${versionId}, Index: ${currentVersionIndex}, Total: ${totalVersions}, isLoading: ${isLoading}`);

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this message?' + 
      (role === 'user' ? ' All following responses might also become inaccessible depending on branching.' : ''))) {
      onDeleteMessage(id);
    }
  };
  
  const handleCopy = () => {
    let textToCopy = '';
    if (typeof content === 'string') {
      textToCopy = content;
    } else if (Array.isArray(content)) {
      textToCopy = content
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n');
    }
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleFeedback = (type) => {
    setFeedback(type);
  };

  const handleSwitchVersion = (direction) => {
    const activeConversationId = useConversationsStore.getState().activeConversationId; 
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
    const activeConversationId = useConversationsStore.getState().activeConversationId; 
    if (!activeConversationId || !id) return;
    console.log("Regenerate requested for message:", id);
    regenerateResponse(activeConversationId, id); 
  };
  
  const renderContent = () => {
    if (isLoading && (!content || (typeof content === 'string' && content.trim() === ''))) {
      return (
        <div className="typing-indicator flex gap-1 py-2">
          <div className="w-2 h-2 rounded-full bg-muted animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-2 h-2 rounded-full bg-muted animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-2 h-2 rounded-full bg-muted animate-bounce"></div>
        </div>
      );
    } 

    const isStreamingThisMessage = isLoading && content && typeof content === 'string' && content.trim() !== '';
    
    if (typeof content === 'string') {
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const codeContent = String(children).replace(/\n$/, '');
                
                return !inline && match ? (
                  <div className="code-block">
                    <div className="code-header">
                      <span>{match[1]}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover/code:opacity-100 transition-opacity"
                        onClick={() => navigator.clipboard.writeText(codeContent)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span className="sr-only">Copy code</span>
                      </Button>
                    </div>
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      className="!p-4 !m-0 rounded-b-md"
                      {...props}
                    >
                      {codeContent}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <code className={cn("relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold", className)} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
          {isStreamingThisMessage && (
            <span className="inline-block h-4 w-1.5 ml-0.5 bg-primary animate-pulse" aria-hidden="true">
            </span>
          )}
        </div>
      );
    } else if (Array.isArray(content)) {
      return (
        <div className="space-y-2">
          {content.map((part, index) => {
            if (part.type === 'text') {
              return (
                <div key={index} className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0">
                  <ReactMarkdown
                     remarkPlugins={[remarkGfm]}
                     components={{
                       code({ node, inline, className, children, ...props }) {
                         const match = /language-(\w+)/.exec(className || '');
                         const codeContent = String(children).replace(/\n$/, '');
                         
                         return !inline && match ? (
                           <div className="code-block">
                             <div className="code-header">
                               <span>{match[1]}</span>
                               <Button
                                 variant="ghost"
                                 size="icon"
                                 className="h-7 w-7 opacity-0 group-hover/code:opacity-100 transition-opacity"
                                 onClick={() => navigator.clipboard.writeText(codeContent)}
                               >
                                 <Copy className="h-3.5 w-3.5" />
                                 <span className="sr-only">Copy code</span>
                               </Button>
                             </div>
                             <SyntaxHighlighter
                               style={vscDarkPlus}
                               language={match[1]}
                               PreTag="div"
                               className="!p-4 !m-0 rounded-b-md"
                               {...props}
                             >
                               {codeContent}
                             </SyntaxHighlighter>
                           </div>
                         ) : (
                           <code className={cn("relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold", className)} {...props}>
                             {children}
                           </code>
                         );
                       },
                     }}
                  >
                    {part.text}
                  </ReactMarkdown>
                </div>
              );
            } else if (part.type === 'image') {
              return (
                <div key={index} className="message-image-wrapper">
                  <img
                    src={part.imageUrl}
                    alt="User uploaded content"
                    className="message-image"
                  />
                </div>
              );
            }
            return null;
          })}
        </div>
      );
    }
    
    return null;
  };
  
  return (
    <div
      className={cn(
        'message-bubble group',
        role === 'user' ? 'user' : 'assistant'
      )}
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-primary/10">
            {role === 'user' ? (
              <User className="h-4 w-4 text-primary" />
            ) : (
              <Bot className="h-4 w-4 text-primary" />
            )}
          </div>
          
          {/* Message content */}
          <div className="flex-1 space-y-2 overflow-hidden">
            {/* Message header */}
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {role === 'user' ? 'You' : 'Assistant'}
              </span>
              
              {interfaceSettings.showModelName && role === 'assistant' && (
                <span className="text-xs text-muted-foreground">
                  {currentModel}
                </span>
              )}
              
              {interfaceSettings.showTimestamps && (
                <span className="text-xs text-muted-foreground">
                  {formatMessageTime(createdAt)}
                </span>
              )}
            </div>
            
            {/* Message body */}
            <div>{renderContent()}</div>
          </div>
        </div>
        
        {!isLoading && (
          <div className="mt-2 pl-10 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            
            {role === 'assistant' && totalVersions > 1 && (
              <div className="flex items-center gap-0.5 mr-2 border border-border rounded-md p-0.5">
                 <Button
                   variant="ghost"
                   size="icon"
                   className="h-6 w-6"
                   onClick={() => handleSwitchVersion('prev')}
                   disabled={!canGoPrev}
                 >
                   <ChevronLeft className="h-3.5 w-3.5" />
                   <span className="sr-only">Previous version</span>
                 </Button>
                 <span className="text-xs font-mono text-muted-foreground tabular-nums">
                   {currentVersionIndex + 1}/{totalVersions}
                 </span>
                 <Button
                   variant="ghost"
                   size="icon"
                   className="h-6 w-6"
                   onClick={() => handleSwitchVersion('next')}
                   disabled={!canGoNext}
                 >
                   <ChevronRight className="h-3.5 w-3.5" />
                   <span className="sr-only">Next version</span>
                 </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete message</span>
            </Button>
            
            {role === 'assistant' && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={handleRegenerate}
                  title="Regenerate response"
                  disabled={useConversationsStore.getState().isLoading}
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="sr-only">Regenerate</span>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-chatgpt-teal" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span className="sr-only">Copy message</span>
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-7 w-7 text-muted-foreground',
                    feedback === 'like' && 'text-chatgpt-teal bg-primary/10'
                  )}
                  onClick={() => handleFeedback('like')}
                >
                  <ThumbsUp className="h-4 w-4" />
                  <span className="sr-only">Like</span>
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-7 w-7 text-muted-foreground',
                    feedback === 'dislike' && 'text-destructive bg-destructive/10'
                  )}
                  onClick={() => handleFeedback('dislike')}
                >
                  <ThumbsDown className="h-4 w-4" />
                  <span className="sr-only">Dislike</span>
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}