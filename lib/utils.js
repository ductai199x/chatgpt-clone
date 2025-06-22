import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { nanoid } from 'nanoid';

/**
 * Combine multiple class names with Tailwind CSS
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a unique ID with optional prefix
 */
export function generateId(prefix = '') {
  return prefix ? `${prefix}_${nanoid()}` : nanoid();
}

/**
 * Format a date for display
 */
export function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Convert a file to base64
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

/**
 * Resize and optimize an image
 */
export async function optimizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const reader = new FileReader();

    reader.onload = function(e) {
      img.src = e.target.result;

      img.onload = function() {
        // Max dimensions
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1080;
        
        let width = img.width;
        let height = img.height;

        // Resize if larger than max dimensions
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          if (width > height) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          } else {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG at 85% quality
        canvas.toBlob(
          blob => {
            resolve(blob);
          },
          'image/jpeg',
          0.92
        );
      };
    };

    reader.onerror = function(e) {
      reject(e);
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Triggers a browser download for the given content.
 * @param {string} content - The text content to download.
 * @param {string} filename - The suggested filename for the download.
 * @param {string} [mimeType='text/plain'] - The MIME type for the blob.
 */
export function downloadTextFile(content, filename, mimeType = 'text/plain') {
  if (typeof window === 'undefined') return; // Guard for SSR or non-browser environments

  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); // Append to body for Firefox compatibility
    a.click();
    document.body.removeChild(a); // Clean up
    URL.revokeObjectURL(url); // Free up memory
  } catch (error) {
    console.error("Error triggering download:", error);
    // Optionally provide user feedback here
  }
}

export function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
}

/**
 * Get file type category and metadata
 * @param {File} file - The file to analyze
 * @returns {Object} File metadata with type, category, and display info
 */
export function getFileMetadata(file) {
  const name = file.name;
  const size = file.size;
  const type = file.type;
  const ext = name.split('.').pop()?.toLowerCase() || '';

  // File type categories
  const categories = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'],
    document: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'],
    spreadsheet: ['xls', 'xlsx', 'csv', 'ods'],
    presentation: ['ppt', 'pptx', 'odp'],
    code: ['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'dart'],
    data: ['json', 'xml', 'yaml', 'yml', 'sql', 'db'],
    archive: ['zip', 'rar', '7z', 'tar', 'gz'],
    audio: ['mp3', 'wav', 'ogg', 'aac', 'flac'],
    video: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm']
  };

  let category = 'unknown';
  for (const [cat, extensions] of Object.entries(categories)) {
    if (extensions.includes(ext)) {
      category = cat;
      break;
    }
  }

  // Get appropriate icon
  const getIcon = () => {
    switch (category) {
      case 'image': return '🖼️';
      case 'document': return '📄';
      case 'spreadsheet': return '📊';
      case 'presentation': return '📽️';
      case 'code': return '💻';
      case 'data': return '📋';
      case 'archive': return '🗜️';
      case 'audio': return '🎵';
      case 'video': return '🎬';
      default: return '📎';
    }
  };

  return {
    name,
    size,
    type,
    ext,
    category,
    icon: getIcon(),
    isImage: category === 'image',
    isText: ['document', 'code', 'data'].includes(category) || ['txt', 'md', 'json', 'xml', 'csv'].includes(ext)
  };
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Process a file for upload - handles both images and other file types
 * Stores files in IndexedDB and returns file ID instead of base64 data
 * @param {File} file - The file to process
 * @param {string} conversationId - Conversation ID for file storage context
 * @returns {Promise<Object>} Processed file data with ID reference
 */
export async function processFileForUpload(file, conversationId = null) {
  const { storeFile } = await import('./utils/file-storage');
  const metadata = getFileMetadata(file);
  const fileId = generateId();
  
  if (metadata.isImage) {
    // For images, optimize and convert to base64, then store in IndexedDB
    try {
      const optimizedBlob = await optimizeImage(file);
      const base64 = await fileToBase64(optimizedBlob);
      
      // Store in IndexedDB
      await storeFile(fileId, base64, {
        conversationId,
        originalName: file.name,
        optimized: true
      });
      
      return {
        id: fileId,
        ...metadata,
        processed: true,
        storedInIndexedDB: true
      };
    } catch (error) {
      console.warn('Image optimization failed, using original:', error);
      const base64 = await fileToBase64(file);
      
      // Store original in IndexedDB
      await storeFile(fileId, base64, {
        conversationId,
        originalName: file.name,
        optimized: false
      });
      
      return {
        id: fileId,
        ...metadata,
        processed: false,
        storedInIndexedDB: true
      };
    }
  } else {
    // For other files, convert directly to base64 and store in IndexedDB
    const base64 = await fileToBase64(file);
    
    // Store in IndexedDB
    await storeFile(fileId, base64, {
      conversationId,
      originalName: file.name,
      optimized: false
    });
    
    return {
      id: fileId,
      ...metadata,
      processed: true,
      storedInIndexedDB: true
    };
  }
}

/**
 * Validate file for upload
 * @param {File} file - The file to validate
 * @param {Object} limits - Upload limits
 * @returns {Object} Validation result
 */
export function validateFileForUpload(file, limits = {}) {
  const {
    allowedTypes = [
      'image/*', 'text/*', 'application/pdf', 'application/json',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv', 'application/zip', 'application/x-zip-compressed'
    ],
    provider = null // Optional provider-specific validation
  } = limits;

  const metadata = getFileMetadata(file);
  const errors = [];

  // Provider-specific restrictions
  if (provider === 'anthropic') {
    // Anthropic: Only images and PDFs for now (simple approach)
    if (metadata.category !== 'image' && metadata.ext !== 'pdf') {
      errors.push(`Anthropic only supports images and PDFs. File type "${metadata.ext}" is not supported.`);
    }
    
    // PDF specific limits for Anthropic (32MB max)
    if (metadata.ext === 'pdf' && file.size > 32 * 1024 * 1024) {
      errors.push(`PDF size (${formatFileSize(file.size)}) exceeds Anthropic limit (32MB)`);
    }
  }

  // Size limits based on file category (following OpenAI/Anthropic guidelines)
  let maxSize;
  if (metadata.category === 'image') {
    maxSize = 20 * 1024 * 1024; // 20MB for images
  } else if (metadata.ext === 'pdf') {
    maxSize = provider === 'anthropic' ? 32 * 1024 * 1024 : 100 * 1024 * 1024; // 32MB for Anthropic, 100MB for others
  } else if (metadata.category === 'spreadsheet' || metadata.ext === 'csv') {
    maxSize = 50 * 1024 * 1024; // 50MB for spreadsheets/CSV
  } else if (['document', 'code', 'data'].includes(metadata.category)) {
    maxSize = 50 * 1024 * 1024; // 50MB for documents/text files
  } else {
    maxSize = 100 * 1024 * 1024; // 100MB for other files
  }

  // Check file size
  if (file.size > maxSize) {
    errors.push(`File size (${formatFileSize(file.size)}) exceeds limit (${formatFileSize(maxSize)}) for ${metadata.category} files`);
  }

  // Check file type - more flexible approach
  const isAllowed = allowedTypes.some(allowedType => {
    if (allowedType === '*/*') return true;
    if (allowedType.endsWith('/*')) {
      const category = allowedType.split('/')[0];
      return file.type.startsWith(category + '/');
    }
    return file.type === allowedType;
  }) || ['txt', 'csv', 'json', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip', 'py', 'js', 'html', 'css', 'md'].includes(metadata.ext);

  if (!isAllowed) {
    errors.push(`File type "${metadata.ext || file.type || 'unknown'}" is not supported`);
  }

  return {
    valid: errors.length === 0,
    errors,
    metadata,
    maxSize
  };
}