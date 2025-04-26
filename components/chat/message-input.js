'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createEditor, Descendant, Transforms, Editor, Element as SlateElement, Text as SlateText } from 'slate';
import { Slate, Editable, withReact, ReactEditor, useSlateStatic, useSelected, useFocused } from 'slate-react';
import { useUIStore } from '@/lib/store/ui-store';
import { useChatStore } from '@/lib/store/chat-store';
import { ArrowUp, Image as ImageIcon, X, Loader2, Code, FileText } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button'; // Assuming you might use Button later
import { useDropzone } from 'react-dropzone';
import { cn, fileToBase64, optimizeImage } from '@/lib/utils';

const ELEMENT_ARTIFACT = 'artifact-reference';

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
        console.log("Normalized artifact node children:", node);
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
  const [images, setImages] = useState([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
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

  // --- Derived State ---
  const isDisabled = formDisabled || isProcessingImages || isLoading || isStreaming; // Combine all disabled conditions

  // --- File Dropzone ---
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'] },
    maxFiles: 5,
    maxSize: 5 * 1024 * 1024,
    noClick: true,
    noKeyboard: true,
    onDrop: async (acceptedFiles, rejectedFiles) => {
      if (acceptedFiles.length + images.length > 5) { /* alert */ return; }
      rejectedFiles.forEach(file => { /* alert */ });
      if (acceptedFiles.length > 0) {
        setIsProcessingImages(true);
        const newImages = [];
        try {
          for (const file of acceptedFiles) {
            const optimizedImageBlob = await optimizeImage(file);
            const base64Image = await fileToBase64(optimizedImageBlob);
            if (images.length + newImages.length < 5) { newImages.push(base64Image); } else { break; }
          }
          setImages(prevImages => [...prevImages, ...newImages].slice(0, 5));
        } catch (error) { console.error('Error processing image:', error); alert('Error processing images.'); }
        finally { setIsProcessingImages(false); }
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

    const canSubmitNow = !isDisabled && (processedMessage !== '' || images.length > 0);

    if (!canSubmitNow) return;

    console.log("Sending:", { processedMessage, images, artifactIds });

    onSendMessage(processedMessage, images, artifactIds);

    // Clear state
    setImages([]);
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

  // --- Remove Image Handler ---
  const removeImage = (indexToRemove) => {
    setImages(prevImages => prevImages.filter((_, i) => i !== indexToRemove));
  };

  // --- Can Submit Logic ---
  const canSubmit = !isDisabled && (!isEditorEmpty || images.length > 0);

  return (
    <div {...getRootProps({
      className: cn(
        'message-input-container',
        isDragActive && 'drag-active'
      )
    })}>
      <form onSubmit={handleSubmit} className="message-input-form p-3">

        {/* Image previews */}
        {images.length > 0 && (
          <div className="message-input-previews mb-2">
            {images.map((image, index) => (
              <div key={index} className="message-input-preview-item group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt={`Preview ${index + 1}`} className="message-input-preview-image" />
                <button
                  type="button" aria-label={`Remove image ${index + 1}`}
                  className="message-input-preview-remove"
                  onClick={(e) => { e.stopPropagation(); removeImage(index); }}
                  disabled={isDisabled}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {isProcessingImages && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          </div>
        )}

        {/* Main Input Row */}
        <div className="message-input-row">
          {/* Image upload button */}
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button" aria-label="Upload image"
                  className={cn(
                    "message-input-upload-button",
                    (isDisabled || images.length >= 5) && "opacity-50 cursor-not-allowed"
                  )}
                  disabled={isDisabled || images.length >= 5}
                  onClick={(e) => { e.stopPropagation(); open(); }}
                >
                  <ImageIcon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center"> <p>Upload image (max 5, 5MB each)</p> </TooltipContent>
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
      </form>

      {/* Hidden file input for dropzone */}
      <input {...getInputProps()} />
    </div>
  );
}