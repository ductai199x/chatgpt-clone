'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createEditor, Transforms, Editor, Element as SlateElement, Text as SlateText } from 'slate';
import { Slate, Editable, withReact, ReactEditor, useSelected, useFocused } from 'slate-react';
import { useUIStore } from '@/lib/store/ui-store';
import { useChatStore } from '@/lib/store/chat-store';
import { useSettingsStore } from '@/lib/store/settings-store';
import { ArrowUp, X, Loader2, Code, FileText, Globe, Terminal, Paperclip } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDropzone } from 'react-dropzone';
import { cn, processFileForUpload, validateFileForUpload, formatFileSize } from '@/lib/utils';

const ELEMENT_ARTIFACT = 'artifact-reference';

// Helper to get an appropriate icon based on tool type
const getToolIcon = (toolId) => {
  switch (toolId) {
    case 'webSearch':
      return <Globe className="h-3.5 w-3.5" />;
    case 'codeExecution':
      return <Terminal className="h-3.5 w-3.5" />;
    default:
      return <Code className="h-3.5 w-3.5" />;
  }
};

// Helper to get an appropriate icon based on artifact type
const getArtifactIcon = (type) => {
  switch (type) {
    case 'code':
      return <Code className="pill-icon h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />;
    case 'html':
      return <FileText className="pill-icon h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />; // Example, choose appropriate icon
    // Add more cases as needed
    default:
      return <FileText className="pill-icon h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />;
  }
};

// --- Tool Selection Pill Component ---
const ToolPill = ({ tool, isSelected, onToggle, disabled }) => {
  const icon = getToolIcon(tool.id);
  
  return (
    <button
      type="button"
      onClick={() => onToggle(tool.id)}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors",
        "border border-border hover:border-border/80",
        isSelected 
          ? "bg-primary text-primary-foreground border-primary" 
          : "bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      title={tool.description}
    >
      {icon}
      <span>{tool.name}</span>
    </button>
  );
};

// --- Artifact Pill Component ---
const ArtifactPill = ({ attributes, children, element }) => {
  const selected = useSelected();
  const focused = useFocused();
  const icon = getArtifactIcon(element.artifactType);

  return (
    <span
      {...attributes}
      contentEditable={false}
      className={cn(
        "artifact-pill", // Base class defined in CSS
        selected && focused && "ring-2 ring-ring ring-offset-2 ring-offset-background"
      )}
      data-artifact-id={element.artifactId}
    >
      {icon}
      <span className="pill-title">{element.artifactTitle}</span>
      {children}
    </span>
  );
};

// --- Slate Plugin for Artifacts ---
const withArtifacts = editor => {
  const { isInline, isVoid, normalizeNode } = editor;

  editor.isInline = element => {
    return element.type === ELEMENT_ARTIFACT ? true : isInline(element);
  };

  editor.isVoid = element => {
    return element.type === ELEMENT_ARTIFACT ? true : isVoid(element);
  };

  // Ensure void nodes always have an empty text child
  editor.normalizeNode = entry => {
    const [node, path] = entry;
    if (SlateElement.isElement(node) && node.type === ELEMENT_ARTIFACT) {
      if (node.children.length !== 1 || !SlateText.isText(node.children[0]) || node.children[0].text !== '') {
        Transforms.insertNodes(editor, { text: '' }, { at: path.concat(0), voids: true });
        // Remove other children if any exist
        for (let i = node.children.length - 1; i > 0; i--) {
          Transforms.removeNodes(editor, { at: path.concat(i), voids: true });
        }
        return; // Return after normalization
      }
    }
    // Fall back to the original normalizeNode function
    normalizeNode(entry);
  };

  return editor;
};

// --- Main MessageInput Component ---
export default function MessageInput({ onSendMessage, isLoading, isStreaming, disabled: formDisabled }) {
  const [files, setFiles] = useState([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const initialValue = useMemo(() => [{ type: 'paragraph', children: [{ text: '' }] }], []);
  const [value, setValue] = useState(initialValue);

  const editorRef = useRef();
  if (!editorRef.current) {
    // Create the editor instance only once
    editorRef.current = withArtifacts(withReact(createEditor()));
  }
  const editor = editorRef.current; // Use the ref's current value

  const referenceToInsert = useUIStore(state => state.referenceToInsert);
  const clearReferenceInsertRequest = useUIStore(state => state.clearReferenceInsertRequest);
  const getArtifactNode = useChatStore(state => state.getArtifactNode);
  const activeConversationId = useChatStore(state => state.activeConversationId);
  
  // Settings store for tool access
  const currentProvider = useSettingsStore(state => state.currentProvider);
  const providers = useSettingsStore(state => state.providers);
  const toggleTool = useSettingsStore(state => state.toggleTool);
  
  // Get available tools for current provider
  const availableTools = useMemo(() => {
    const provider = providers[currentProvider];
    return provider?.tools || [];
  }, [providers, currentProvider]);

  // --- Derived State ---
  const isDisabled = formDisabled || isProcessingFiles || isLoading || isStreaming; // Combine all disabled conditions
  
  // --- Tool Selection Handlers ---
  const handleToggleTool = useCallback((toolId) => {
    toggleTool(currentProvider, toolId);
  }, [toggleTool, currentProvider]);

  // --- File Dropzone ---
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.svg'],
      'text/*': ['.txt', '.md', '.csv'],
      'application/pdf': ['.pdf'],
      'application/json': ['.json'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/zip': ['.zip'],
      'text/csv': ['.csv'],
      // Add common code file types
      'text/javascript': ['.js'],
      'text/html': ['.html'],
      'text/css': ['.css'],
      'text/x-python': ['.py'],
    },
    maxFiles: 5,
    noClick: true,
    noKeyboard: true,
    onDrop: async (acceptedFiles, rejectedFiles) => {
      // Handle rejected files
      rejectedFiles.forEach(({ file, errors }) => {
        console.warn(`File ${file.name} rejected:`, errors);
        const errorMessages = errors.map(e => e.message).join(', ');
        alert(`File "${file.name}" was rejected: ${errorMessages}`);
      });

      if (acceptedFiles.length + files.length > 5) {
        alert('Maximum 5 files allowed');
        return;
      }

      if (acceptedFiles.length > 0) {
        setIsProcessingFiles(true);
        const newFiles = [];
        const errors = [];

        try {
          for (const file of acceptedFiles) {
            // Validate file with current provider context
            const validation = validateFileForUpload(file, { provider: currentProvider });
            if (!validation.valid) {
              errors.push(`${file.name}: ${validation.errors.join(', ')}`);
              continue;
            }

            // Process file
            if (files.length + newFiles.length < 5) {
              try {
                const processedFile = await processFileForUpload(file);
                newFiles.push(processedFile);
              } catch (error) {
                console.error('Error processing file:', file.name, error);
                errors.push(`${file.name}: Failed to process file`);
              }
            } else {
              break;
            }
          }

          if (errors.length > 0) {
            alert('Some files could not be uploaded:\n' + errors.join('\n'));
          }

          if (newFiles.length > 0) {
            setFiles(prevFiles => [...prevFiles, ...newFiles].slice(0, 5));
          }
        } catch (error) {
          console.error('Error processing files:', error);
          alert('Error processing files.');
        } finally {
          setIsProcessingFiles(false);
        }
      }
    }
  });

  // --- Effect to handle reference insertion ---
  useEffect(() => {
    if (referenceToInsert) {
      const { id: artifactId } = referenceToInsert;
      const node = activeConversationId ? getArtifactNode(activeConversationId, artifactId) : null;
      const title = node?.metadata?.filename || node?.metadata?.title || `Artifact (${artifactId.slice(0, 6)})`;
      const type = node?.metadata?.type || 'unknown';

      const artifactNode = {
        type: ELEMENT_ARTIFACT,
        artifactId: artifactId,
        artifactTitle: title,
        artifactType: type, // Store type for icon rendering
        children: [{ text: '' }], // Void elements need an empty text child
      };

      // Ensure focus before inserting
      ReactEditor.focus(editor);

      // Insert a space before the pill if the selection isn't already preceded by one
      const { selection } = editor;
      if (selection && selection.anchor.offset > 0) {
        const before = Editor.before(editor, selection.anchor, { unit: 'character' });
        if (before) {
          const beforeText = Editor.string(editor, Editor.range(editor, before, selection.anchor));
          if (beforeText !== ' ') {
            Transforms.insertText(editor, ' ');
          }
        }
      } else if (!selection) {
        // If no selection, move to end and potentially add space
        Transforms.select(editor, Editor.end(editor, []));
        const end = Editor.end(editor, []);
        if (end.offset > 0) {
          const before = Editor.before(editor, end, { unit: 'character' });
          if (before) {
            const beforeText = Editor.string(editor, Editor.range(editor, before, end));
            if (beforeText !== ' ') {
              Transforms.insertText(editor, ' ');
            }
          }
        }
      }

      Transforms.insertNodes(editor, artifactNode);
      // Insert a space after the pill for easier typing
      Transforms.move(editor); // Move cursor after the inserted node
      Transforms.insertText(editor, ' ');
      // Ensure focus again after transforms
      ReactEditor.focus(editor);

      clearReferenceInsertRequest();
    }
  }, [referenceToInsert, clearReferenceInsertRequest, getArtifactNode, activeConversationId, editor]);

  // --- Render Element Callback ---
  const renderElement = useCallback(props => {
    switch (props.element.type) {
      case ELEMENT_ARTIFACT:
        return <ArtifactPill {...props} />;
      default: // paragraph
        return <p {...props.attributes}>{props.children}</p>;
    }
  }, []);

  // --- Render Leaf Callback (Optional, for text styling) ---
  const renderLeaf = useCallback(props => {
    return <span {...props.attributes}>{props.children}</span>;
  }, []);

  // --- Serialization Function ---
  const serializeToString = (nodes) => {
    let message = '';
    const collectedIds = new Set();

    const serializeNode = (node) => {
      if (SlateText.isText(node)) {
        return node.text;
      }

      if (SlateElement.isElement(node)) {
        if (node.type === ELEMENT_ARTIFACT) {
          collectedIds.add(node.artifactId);
          return `(referencing artifact with id="${node.artifactId}")`; // The tag for the backend
        }

        // Handle paragraphs or other block elements
        const childrenString = node.children.map(serializeNode).join('');
        if (node.type === 'paragraph') {
          return childrenString + '\n';
        }
        return childrenString;
      }

      return '';
    };

    message = nodes.map(serializeNode).join('').replace(/\n$/, '');

    return { message, artifactIds: Array.from(collectedIds) };
  };

  // --- Check if Editor is Empty ---
  const isEditorEmpty = useMemo(() => {
    if (value.length > 1) return false;
    const firstNode = value[0];
    if (!SlateElement.isElement(firstNode) || firstNode.type !== 'paragraph') return false;
    if (firstNode.children.length > 1) return false;
    const firstText = firstNode.children[0];
    return SlateText.isText(firstText) && firstText.text === '';
  }, [value]);

  // --- Submit Handler ---
  const handleSubmit = (e) => {
    e?.preventDefault();

    const { message: processedMessage, artifactIds } = serializeToString(value);

    const canSubmitNow = !isDisabled && (processedMessage !== '' || files.length > 0);

    if (!canSubmitNow) return;

    // Get enabled tools for the current provider
    const enabledTools = availableTools.filter(tool => tool.enabled);

    // Convert files to the format expected by the chat system
    // For backward compatibility, separate images from other files
    const images = files.filter(f => f.isImage).map(f => f.data);
    const attachments = files.map(f => ({
      id: f.id,
      name: f.name,
      size: f.size,
      type: f.type,
      category: f.category,
      data: f.data,
      isImage: f.isImage
    }));

    onSendMessage(processedMessage, images, artifactIds, enabledTools, attachments);

    // Clear state
    setFiles([]);
    // Reset Slate editor
    Transforms.delete(editor, {
      at: {
        anchor: Editor.start(editor, []),
        focus: Editor.end(editor, []),
      },
    });
    // Ensure it resets to a paragraph if completely cleared
    if (editor.children.length === 0 || !SlateElement.isElement(editor.children[0]) || editor.children[0].type !== 'paragraph') {
      setValue(initialValue);
    }
  };

  // --- Keyboard Handler ---
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  // --- Remove File Handler ---
  const removeFile = (indexToRemove) => {
    setFiles(prevFiles => prevFiles.filter((_, i) => i !== indexToRemove));
  };

  // --- Can Submit Logic ---
  const canSubmit = !isDisabled && (!isEditorEmpty || files.length > 0);

  return (
    <div {...getRootProps({
      className: cn(
        'message-input-container',
        isDragActive && 'drag-active'
      )
    })}>
      <form onSubmit={handleSubmit} className="message-input-form p-3">

        {/* File previews */}
        {files.length > 0 && (
          <div className="message-input-previews mb-2">
            {files.map((file, index) => (
              <div key={file.id} className="message-input-preview-item group">
                {file.isImage ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={file.data} alt={file.name} className="message-input-preview-image" />
                ) : (
                  <div className="message-input-preview-file">
                    <div className="file-icon text-2xl mb-1">{file.icon}</div>
                    <div className="file-info text-center">
                      <div className="file-name text-[0.7rem] font-medium truncate max-w-16" title={file.name}>
                        {file.name}
                      </div>
                      <div className="file-size text-[0.7rem] text-muted-foreground">
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                  </div>
                )}
                <button
                  type="button" aria-label={`Remove ${file.name}`}
                  className="message-input-preview-remove"
                  onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                  disabled={isDisabled}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {isProcessingFiles && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          </div>
        )}

        {/* Main Input Row */}
        <div className="message-input-row">
          {/* File upload button */}
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button" aria-label="Upload files"
                  className={cn(
                    "message-input-upload-button",
                    (isDisabled || files.length >= 5) && "opacity-50 cursor-not-allowed"
                  )}
                  disabled={isDisabled || files.length >= 5}
                  onClick={(e) => { e.stopPropagation(); open(); }}
                >
                  <Paperclip className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center"> 
                <p>Upload files (max 5)</p>
                {currentProvider === 'anthropic' ? (
                  <p className="text-xs mt-1">Images: 20MB, PDFs: 32MB</p>
                ) : (
                  <p className="text-xs mt-1">Images: 20MB, Documents: 50MB, Other: 100MB</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* --- Slate Editor --- */}
          <div className="slate-editor-wrapper">
            <Slate editor={editor} initialValue={value} onChange={setValue}>
              <Editable
                renderElement={renderElement}
                renderLeaf={renderLeaf}
                placeholder="Ask anything..."
                onKeyDown={handleKeyDown}
                className="slate-editable"
                readOnly={isDisabled}
              />
            </Slate>
          </div>
          {/* --- End Slate Editor --- */}

          {/* Send button */}
          <button
            type="submit" aria-label="Send message"
            className={cn(
              "message-input-send-button",
              isStreaming && "streaming",
              !canSubmit && "opacity-50 cursor-not-allowed"
            )}
            disabled={!canSubmit}
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        </div>

        {/* Tool Selection Pills */}
        {availableTools.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-muted-foreground font-medium self-center">Tools:</span>
            {availableTools.map(tool => (
              <ToolPill
                key={tool.id}
                tool={tool}
                isSelected={tool.enabled}
                onToggle={handleToggleTool}
                disabled={isDisabled}
              />
            ))}
          </div>
        )}
      </form>

      {/* Hidden file input for dropzone */}
      <input {...getInputProps()} />
    </div>
  );
}