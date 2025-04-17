'use client';

import { useState, useRef, useEffect } from 'react';
// Use ArrowUp instead of Send for the send icon
import { ArrowUp, Image as ImageIcon, X, Loader2 } from 'lucide-react'; 
import { Button } from '@/components/ui/button'; // Keep using Button for consistency if needed elsewhere
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDropzone } from 'react-dropzone';
import { cn, fileToBase64, optimizeImage } from '@/lib/utils';

export default function MessageInput({ onSendMessage, isLoading, isStreaming, disabled: formDisabled }) {
  const [message, setMessage] = useState('');
  const [images, setImages] = useState([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false); // State for image processing
  const textareaRef = useRef(null);
  
  // Combine disabled states
  const isDisabled = formDisabled || isProcessingImages;

  // Handle textarea auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // Reset height
      // Calculate based on scroll height, max 200px ~ 5 lines
      const newHeight = Math.min(textareaRef.current.scrollHeight, 200); 
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [message]);
  
  // File dropzone
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    maxFiles: 5,
    maxSize: 5 * 1024 * 1024, // 5MB in bytes
    noClick: true, // Disable opening dialog on container click by default
    noKeyboard: true,
    onDrop: async (acceptedFiles, rejectedFiles) => {
      // Check for max files including current ones
      if (acceptedFiles.length + images.length > 5) {
        alert('You can only upload up to 5 images at a time.');
        return;
      }
      
      // Handle rejected files (show alerts)
      rejectedFiles.forEach(file => {
        const error = file.errors[0];
        let message = `File ${file.file.name} error: ${error?.message}`;
        if (error?.code === 'file-too-large') message = `File ${file.file.name} exceeds 5MB limit.`;
        if (error?.code === 'file-invalid-type') message = `File ${file.file.name} has an unsupported type.`;
        alert(message);
      });
      
      // Process accepted files
      if (acceptedFiles.length > 0) {
        setIsProcessingImages(true); // Start processing indicator
        const newImages = [];
        try {
          for (const file of acceptedFiles) {
            // Optimize image before adding it
            const optimizedImageBlob = await optimizeImage(file);
            const base64Image = await fileToBase64(optimizedImageBlob);
            // Only add if processing hasn't been cancelled/component unmounted
            if (images.length + newImages.length < 5) { 
              newImages.push(base64Image);
            } else {
              break; // Stop if max count reached during async processing
            }
          }
          // Update state only if still processing
          setImages(prevImages => [...prevImages, ...newImages].slice(0, 5)); // Ensure max 5
        } catch (error) {
          console.error('Error processing image:', error);
          alert('An error occurred while processing images.');
        } finally {
          setIsProcessingImages(false); // End processing indicator
        }
      }
    }
  });
  
  // Handle submit
  const handleSubmit = (e) => {
    e.preventDefault();
    if (isDisabled || (message.trim() === '' && images.length === 0)) return; // Prevent submit if disabled or empty

    onSendMessage(message.trim(), images);
    setMessage('');
    setImages([]);
    
    // Reset textarea height after send
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; 
    }
  };
  
  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };
  
  // Remove image
  const removeImage = (indexToRemove) => {
    setImages(prevImages => prevImages.filter((_, i) => i !== indexToRemove));
  };

  const canSubmit = !isDisabled && (message.trim() !== '' || images.length > 0);

  return (
    // Apply dropzone props to the main container
    <div {...getRootProps({
      className: cn(
        'message-input-container', // Use the new base class
        isDragActive && 'drag-active' // Use the new drag active class
      )
    })}>
      <form onSubmit={handleSubmit} className="message-input-form">
        {/* Image previews */}
        {images.length > 0 && (
          <div className="message-input-previews">
            {images.map((image, index) => (
              <div key={index} className="message-input-preview-item group">
                {/* Preview Image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={image} 
                  alt={`Preview ${index + 1}`} 
                  className="message-input-preview-image"
                />
                {/* Remove button */}
                <button
                  type="button"
                  aria-label={`Remove image ${index + 1}`}
                  className="message-input-preview-remove group-hover:opacity-100 hover:text-destructive-foreground"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent dropzone click
                    removeImage(index);
                  }}
                  disabled={isDisabled} // Disable remove button when form is disabled
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {/* Optional: Show spinner while processing images */}
            {isProcessingImages && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          </div>
        )}
        
        {/* Main Input Row */}
        <div className="message-input-row">
          {/* Image upload button */}
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Use a standard button, styled via CSS */}
                <button
                  type="button"
                  aria-label="Upload image"
                  className={cn(
                    "message-input-upload-button",
                    "h-10 w-10 flex items-center justify-center rounded-lg", // Ensure size and shape
                    isDisabled && "opacity-50 cursor-not-allowed"
                  )}
                  disabled={isDisabled || images.length >= 5}
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent form submit/dropzone click
                    open(); // Open file dialog from dropzone
                  }}
                >
                  <ImageIcon className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center">
                <p>Upload image (max 5, 5MB each)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            className="message-input-textarea auto-grow-textarea" // Use the new textarea class
            disabled={isDisabled}
            rows={1}
            aria-label="Message input"
          />
          
          {/* Send button */}
          <button
            type="submit"
            aria-label="Send message"
            className={cn(
              "message-input-send-button", // Use the new send button class
              isStreaming && "streaming" // Optional class for streaming state
            )}
            disabled={!canSubmit} // Disable based on combined state
          >
            {/* Use ArrowUp icon */}
            <ArrowUp className="h-5 w-5" /> 
          </button>
        </div>
      </form>
      
      {/* Hidden file input for dropzone */}
      <input {...getInputProps()} />
    </div>
  );
}