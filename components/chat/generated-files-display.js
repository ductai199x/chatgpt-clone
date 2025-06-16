'use client';

import { useState, useEffect, useCallback } from 'react';
import { getFileIcon, formatFileSize } from '@/lib/utils/file-handler';
import { useSettingsStore } from '@/lib/store/settings-store';

// Individual file component with caching and download functionality
function FileItem({ file, prefix }) {
  const [cachedData, setCachedData] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showHoverPreview, setShowHoverPreview] = useState(false);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCaching, setIsCaching] = useState(false);
  const { providers } = useSettingsStore();

  const isImage = file.filename?.match(/\.(png|jpg|jpeg|gif|svg)$/i);
  const MAX_AUTO_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
  const shouldAutoCache = file.bytes && file.bytes <= MAX_AUTO_CACHE_SIZE;

  useEffect(() => {
    loadCachedFile().then(cached => {
      if (cached) {
        setCachedData(cached);
        if (isImage) {
          const url = window.URL.createObjectURL(cached);
          setPreviewUrl(url);
        }
      } else if (shouldAutoCache) {
        downloadAndCacheFile();
      }
    });
  }, [file, downloadAndCacheFile, isImage, loadCachedFile, shouldAutoCache]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const loadCachedFile = useCallback(async () => {
    const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    // Try localStorage first
    try {
      const cacheKey = `file_cache_${file.file_id}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        const { dataUrl, cachedAt } = JSON.parse(cached);
        const age = Date.now() - cachedAt;
        
        if (age < MAX_AGE) {
          const response = await fetch(dataUrl);
          return await response.blob();
        } else {
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (error) {
      // Silent cleanup - not critical to log
    }
    
    // Try memory cache as fallback
    if (window.fileCache && window.fileCache.has(file.file_id)) {
      try {
        const cached = window.fileCache.get(file.file_id);
        const age = Date.now() - cached.cachedAt;
        
        if (age < MAX_AGE) {
          return cached.blob;
        } else {
          window.fileCache.delete(file.file_id);
        }
      } catch (error) {
        // Silent cleanup - not critical to log
      }
    }
    
    return null;
  }, [file.file_id]);

  const saveCachedFile = useCallback(async (blob) => {
    try {
      const cacheKey = `file_cache_${file.file_id}`;
      const fileSizeEstimate = blob.size * 1.37; // Base64 is ~37% larger than binary
      
      // Use memory cache for large files
      if (fileSizeEstimate > 3 * 1024 * 1024) { // 3MB threshold
        saveToMemoryCache(blob);
        return;
      }
      
      const reader = new FileReader();
      
      return new Promise((resolve) => {
        reader.onload = () => {
          try {
            const cacheData = {
              dataUrl: reader.result,
              filename: file.filename,
              cachedAt: Date.now()
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            resolve();
          } catch (e) {
            if (e.name === 'QuotaExceededError') {
              cleanupOldCache();
              saveToMemoryCache(blob);
            }
            resolve(); // Don't fail the caching process
          }
        };
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      // Silent fallback to memory cache
      saveToMemoryCache(blob);
    }
  }, [file.file_id, file.filename, cleanupOldCache, saveToMemoryCache]);

  const saveToMemoryCache = useCallback((blob) => {
    if (!window.fileCache) window.fileCache = new Map();
    
    const cacheData = {
      blob: blob,
      filename: file.filename,
      cachedAt: Date.now()
    };
    
    window.fileCache.set(file.file_id, cacheData);
  }, [file.file_id, file.filename]);

  const cleanupOldCache = useCallback(() => {
    try {
      const cacheEntries = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('file_cache_')) {
          try {
            const cached = JSON.parse(localStorage.getItem(key));
            cacheEntries.push({ key, cachedAt: cached.cachedAt });
          } catch (e) {
            cacheEntries.push({ key, cachedAt: 0 });
          }
        }
      }
      
      // Remove oldest 3 entries
      cacheEntries.sort((a, b) => a.cachedAt - b.cachedAt);
      const toRemove = cacheEntries.slice(0, 3);
      
      toRemove.forEach(entry => {
        localStorage.removeItem(entry.key);
      });
    } catch (error) {
      // Silent cleanup failure
    }
  }, []);

  const downloadAndCacheFile = useCallback(async () => {
    const apiKey = providers[file.provider]?.apiKey;
    if (!apiKey) return;

    setIsCaching(true);
    try {
      const requestBody = {
        apiKey,
        action: 'download'
      };
      
      if (file.provider === 'openai') {
        requestBody.container_id = file.container_id;
        requestBody.file_id = file.file_id;
      } else if (file.provider === 'anthropic') {
        requestBody.file_id = file.file_id;
      }
      
      const response = await fetch(file.download_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      if (response.ok) {
        const blob = await response.blob();
        setCachedData(blob);
        
        // Save to cache
        await saveCachedFile(blob);
        
        if (isImage) {
          const url = window.URL.createObjectURL(blob);
          setPreviewUrl(url);
        }
      }
    } catch (error) {
      console.error('Error caching file:', error);
    } finally {
      setIsCaching(false);
    }
  }, [providers, file.provider, file.container_id, file.file_id, file.download_url, isImage, saveCachedFile]);

  const handleDownload = async (e) => {
    e.stopPropagation();
    if (isDownloading) return;
    setIsDownloading(true);
    
    try {
      let blob = cachedData;
      
      // Download if not cached
      if (!blob) {
        const apiKey = providers[file.provider]?.apiKey;
        if (!apiKey) return;
        
        const requestBody = {
          apiKey,
          action: 'download'
        };
        
        if (file.provider === 'openai') {
          requestBody.container_id = file.container_id;
          requestBody.file_id = file.file_id;
        } else if (file.provider === 'anthropic') {
          requestBody.file_id = file.file_id;
        }
        
        const response = await fetch(file.download_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) throw new Error('Download failed');
        blob = await response.blob();
      }
      
      // Trigger download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading file:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRowHover = (e) => {
    if (isImage && previewUrl) {
      const rect = e.currentTarget.getBoundingClientRect();
      setHoverPosition({
        x: rect.right + 10,
        y: rect.top + rect.height / 2
      });
      setShowHoverPreview(true);
    }
  };

  const handleRowLeave = () => {
    setShowHoverPreview(false);
  };

  return (
    <>
      <div 
        className="file-row-compact"
        onMouseEnter={handleRowHover}
        onMouseLeave={handleRowLeave}
      >
        <span className="file-prefix">{prefix}</span>
        <span className="file-icon">{getFileIcon(file.filename)}</span>
        <div className="file-info-compact">
          <span 
            className="file-name-link"
            onClick={handleDownload}
          >
            {file.filename}
          </span>
          {file.bytes && (
            <span className="file-size-compact">({formatFileSize(file.bytes)})</span>
          )}
          <button 
            className="file-download-link" 
            onClick={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? '[Downloading...]' : cachedData ? '[Download ✓]' : isCaching ? '[Caching...]' : '[Download]'}
          </button>
        </div>
      </div>

      {/* Hover preview tooltip */}
      {showHoverPreview && isImage && previewUrl && (
        <div 
          className="hover-preview-tooltip"
          style={{
            position: 'fixed',
            left: hoverPosition.x,
            top: hoverPosition.y - 100,
            zIndex: 1000,
            pointerEvents: 'none'
          }}
        >
          <img 
            src={previewUrl} 
            alt={file.filename}
            className="hover-preview-image"
            onError={() => setShowHoverPreview(false)}
          />
        </div>
      )}
    </>
  );
}

// Main component for displaying generated files
export default function GeneratedFilesDisplay({ files, toolId }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!files || files.length === 0) {
    return null;
  }

  const fileCount = files.length;

  return (
    <div className="files-section-compact">
      <div 
        className="files-header-compact"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="files-count-compact">
          📎 Generated Files ({fileCount}) {isExpanded ? '▲' : '▼'}
        </span>
      </div>

      {isExpanded && (
        <div className="files-list-compact">
          {files.map((file, index) => {
            const isLast = index === files.length - 1;
            const prefix = isLast ? '└─' : '├─';
            
            return (
              <FileItem 
                key={file.file_id || `${toolId}-file-${index}`} 
                file={file}
                prefix={prefix}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}