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
 * Generate a unique ID
 */
export function generateId() {
  return nanoid();
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