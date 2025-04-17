'use client';

import { useState } from 'react';
import { User, Bot, Copy, Check, ThumbsUp, ThumbsDown, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/lib/store/settings-store';
import { formatDate, formatMessageTime } from '@/lib/utils/conversation';
import Image from 'next/image';

export default function ChatMessage({ message, isLoading, onDeleteMessage }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const { interface: interfaceSettings, currentModel } = useSettingsStore();
  
  const { role, content, createdAt, id } = message;

  // Handle delete message
  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this message?' + 
      (role === 'user' ? ' All following responses will also be deleted.' : ''))) {
      onDeleteMessage(id);
    }
  };
  
  // Handle copy message content
  const handleCopy = () => {
    // Handle content with images
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
  
  // Handle user feedback
  const handleFeedback = (type) => {
    setFeedback(type);
    // In a real app, this would send feedback to the server
  };
  
  // Render content based on type (text or images)
  const renderContent = () => {
    if (isLoading) {
      // If it's actually loading (empty content)
      if (!content || (typeof content === 'string' && content.trim() === '')) {
        return (
          <div className="typing-indicator flex gap-1 py-2">
            <div className="w-2 h-2 rounded-full bg-muted animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-2 h-2 rounded-full bg-muted animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-2 h-2 rounded-full bg-muted animate-bounce"></div>
          </div>
        );
      } 
    }

    const isStreaming = isLoading && content && typeof content === 'string' && content.trim() !== '';
    
    if (typeof content === 'string') {
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                
                return !inline && match ? (
                  <div className="code-block">
                    <div className="code-header">
                      <span>{match[1]}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          navigator.clipboard.writeText(children[0]);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        <span className="sr-only">Copy code</span>
                      </Button>
                    </div>
                    <SyntaxHighlighter
                      style={vscDarkPlus}
                      language={match[1]}
                      PreTag="div"
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
          {isStreaming && (
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
                        
                        return !inline && match ? (
                          <div className="code-block">
                            <div className="code-header">
                              <span>{match[1]}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  navigator.clipboard.writeText(children[0]);
                                }}
                              >
                                <Copy className="h-4 w-4" />
                                <span className="sr-only">Copy code</span>
                              </Button>
                            </div>
                            <SyntaxHighlighter
                              style={vscDarkPlus}
                              language={match[1]}
                              PreTag="div"
                              {...props}
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          </div>
                        ) : (
                          <code className={className} {...props}>
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={part.imageUrl}
                    alt="User uploaded image"
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
        
        {/* Message actions */}
        {!isLoading && (
          <div className="mt-2 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Delete button - for both user and assistant messages */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
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
                  className="h-8 w-8"
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
                    'h-8 w-8',
                    feedback === 'like' && 'text-chatgpt-teal'
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
                    'h-8 w-8',
                    feedback === 'dislike' && 'text-destructive'
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