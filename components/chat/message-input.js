'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Image as ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDropzone } from 'react-dropzone';
import { cn, fileToBase64, optimizeImage } from '@/lib/utils';

export default function MessageInput({ onSendMessage, isLoading, isStreaming, disabled }) {
  const [message, setMessage] = useState('');
  const [images, setImages] = useState([]);
  const textareaRef = useRef(null);
  
  // Handle textarea auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to get the correct scrollHeight
      textareaRef.current.style.height = 'auto';
      // Set the height based on scrollHeight, with a maximum height
      const newHeight = Math.min(textareaRef.current.scrollHeight, 150);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [message]);
  
  // File dropzone
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    maxFiles: 5,
    maxSize: 5242880, // 5MB
    onDrop: async (acceptedFiles, rejectedFiles) => {
      // Check for max files
      if (acceptedFiles.length + images.length > 5) {
        alert('You can only upload up to 5 images at a time.');
        return;
      }
      
      // Process rejected files
      if (rejectedFiles.length > 0) {
        rejectedFiles.forEach(file => {
          if (file.errors[0]?.code === 'file-too-large') {
            alert(`File ${file.file.name} is too large. Maximum size is 5MB.`);
          } else {
            alert(`File ${file.file.name} could not be uploaded: ${file.errors[0]?.message}`);
          }
        });
      }
      
      // Process accepted files
      const newImages = [];
      
      for (const file of acceptedFiles) {
        try {
          // Optimize image before adding it
          const optimizedImageBlob = await optimizeImage(file);
          const base64Image = await fileToBase64(optimizedImageBlob);
          newImages.push(base64Image);
        } catch (error) {
          console.error('Error processing image:', error);
        }
      }
      
      setImages(prevImages => [...prevImages, ...newImages]);
    }
  });
  
  // Handle submit
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (message.trim() || images.length > 0) {
      onSendMessage(message.trim(), images);
      setMessage('');
      setImages([]);
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
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
  const removeImage = (index) => {
    setImages(prevImages => prevImages.filter((_, i) => i !== index));
  };
  
  return (
    <div {...getRootProps({
      className: cn(
        'rounded-lg border bg-background p-4 shadow-sm transition-all',
        isDragActive && 'border-primary ring-2 ring-primary ring-opacity-50'
      ),
      onClick: e => e.stopPropagation() // Prevent opening file dialog on container click
    })}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((image, index) => (
              <div key={index} className="relative group">
                {/* Preview */}
                <div className="w-20 h-20 rounded-md overflow-hidden border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={image} 
                    alt={`Preview ${index + 1}`} 
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Remove button */}
                <button
                  type="button"
                  className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(index);
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex items-end gap-10">
          {/* Message input */}
          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              className="auto-grow-textarea w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              rows={1}
            />
          </div>
          
          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0 mb-[2px]">
            {/* Image upload button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    disabled={disabled || images.length >= 5}
                    onClick={(e) => {
                      e.stopPropagation();
                      open();
                    }}
                  >
                    <ImageIcon className="h-5 w-5" />
                    <span className="sr-only">Add image</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Upload image (max 5)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            {/* Send button */}
            <Button
              type="submit"
              size="icon"
              className={cn(
                "h-10 w-10",
                isStreaming && "bg-green-600 hover:bg-green-700" // Green during streaming
              )}
              disabled={disabled || (message.trim() === '' && images.length === 0)}
              variant="chatgpt"
            >
              {isStreaming ? (
                // Show a different icon during streaming
                <span className="flex items-center justify-center">···</span>
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="sr-only">
                {isStreaming ? "Receiving response" : "Send message"}
              </span>
            </Button>
          </div>
        </div>
      </form>
      
      {/* Hidden file input */}
      <input {...getInputProps()} />
    </div>
  );
}