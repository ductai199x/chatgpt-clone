/**
 * Generic file handling utilities for code execution across different AI providers
 * 
 * Supports:
 * - OpenAI: Container-based file system
 * - Anthropic: Files API with beta headers
 * - Future providers can be added with minimal changes
 */

/**
 * Extract file information from tool results based on provider
 * @param {Object} toolResult - The tool execution result
 * @param {string} provider - Provider name ('openai', 'anthropic', etc.)
 * @returns {Array} Array of file objects with unified structure
 */
export function extractFilesFromToolResult(toolResult, provider) {
  const files = [];
  
  switch (provider) {
    case 'openai':
      // OpenAI: Files might be in outputs or need to be fetched from container
      if (toolResult.content?.container_id) {
        // Return container info for later file listing
        return [{
          type: 'container_check_needed',
          container_id: toolResult.content.container_id,
          tool_use_id: toolResult.tool_use_id
        }];
      }
      break;
      
    case 'anthropic':
      // Anthropic: Files are included in tool result content.content array
      if (toolResult.content?.content && Array.isArray(toolResult.content.content)) {
        toolResult.content.content.forEach(item => {
          if (item.type === 'code_execution_output' && item.file_id) {
            files.push({
              type: 'file',
              file_id: item.file_id,
              filename: item.filename || `file_${item.file_id}`,
              provider: 'anthropic',
              download_url: `/api/anthropic/files`
            });
          }
        });
      }
      // Also check the legacy files structure for backward compatibility
      if (toolResult.content?.files) {
        toolResult.content.files.forEach(file => {
          files.push({
            type: 'file',
            file_id: file.file_id,
            filename: file.filename || 'unknown_file',
            provider: 'anthropic',
            download_url: `/api/anthropic/files`
          });
        });
      }
      break;
      
    default:
      console.warn(`File extraction not implemented for provider: ${provider}`);
  }
  
  return files;
}

/**
 * Check for generated files in a container (primarily for OpenAI)
 * @param {string} containerId - Container ID
 * @param {string} apiKey - API key for the provider
 * @param {string} provider - Provider name
 * @returns {Promise<Array>} Array of generated files
 */
export async function checkContainerFiles(containerId, apiKey, provider = 'openai') {
  try {
    let url, headers;
    
    switch (provider) {
      case 'openai':
        url = `/api/openai/files`;
        headers = { 
          'Content-Type': 'application/json'
        };
        break;
        
      case 'anthropic':
        // Anthropic doesn't use containers, files are in tool results
        return [];
        
      default:
        throw new Error(`Container file checking not supported for provider: ${provider}`);
    }
    
    const requestBody = {
      apiKey,
      container_id: containerId,
      action: 'list'
    };
        
    const response = await fetch(url, { 
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      console.error(`[File Handler] Request failed with status ${response.status}`);
      throw new Error(`Failed to check container files: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Convert to unified format
    const files = (data.generated_files || []).map(file => ({
      type: 'file',
      file_id: file.id,
      filename: extractFilename(file.path || `file_${file.id}`),
      bytes: file.bytes,
      created_at: file.created_at,
      provider: provider,
      container_id: containerId,
      download_url: `/api/${provider}/files`
    }));
    
    return files;
    
  } catch (error) {
    console.error('Error checking container files:', error);
    return [];
  }
}

/**
 * Generate download URL for a file based on provider
 * @param {Object} fileInfo - File information object
 * @returns {string} Download URL
 */
export function getFileDownloadUrl(fileInfo) {
  const { provider } = fileInfo;
  
  switch (provider) {
    case 'openai':
      return `/api/openai/files`;
      
    case 'anthropic':
      return `/api/anthropic/files`;
      
    default:
      throw new Error(`Download URL generation not supported for provider: ${provider}`);
  }
}

/**
 * Extract filename from path
 * @param {string} path - File path
 * @returns {string} Filename
 */
function extractFilename(path) {
  if (!path) return 'unknown_file';
  return path.split('/').pop() || 'unknown_file';
}

/**
 * Get file icon based on extension
 * @param {string} filename - File name
 * @returns {string} Icon name or emoji
 */
export function getFileIcon(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return '🖼️';
    case 'csv':
      return '📊';
    case 'json':
      return '📋';
    case 'txt':
    case 'md':
      return '📄';
    case 'pdf':
      return '📕';
    case 'xlsx':
    case 'xls':
      return '📈';
    case 'doc':
    case 'docx':
      return '📝';
    case 'ppt':
    case 'pptx':
      return '📽️';
    case 'msg':
      return '📧';
    case 'vsd':
      return '📐';
    case 'mpp':
      return '📅';
    case 'zip':
      return '🗜️';
    case 'py':
      return '🐍';
    case 'js':
      return '📜';
    case 'html':
    case 'htm':
      return '🌐';
    case 'css':
      return '🎨';
    default:
      return '📎';
  }
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size
 */
export function formatFileSize(bytes) {
  if (!bytes) return 'Unknown size';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(1);
  
  return `${size} ${sizes[i]}`;
}

/**
 * Fetch metadata for Anthropic files to get proper filenames
 * @param {Array} files - Array of file objects with file_id
 * @param {string} apiKey - Anthropic API key
 * @returns {Promise<Array>} Array of files with updated metadata
 */
export async function fetchAnthropicFileMetadata(files, apiKey) {
  if (!apiKey || !files || files.length === 0) {
    return files;
  }
  
  const updatedFiles = [];
  
  for (const file of files) {
    try {
      const response = await fetch('/api/anthropic/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          file_id: file.file_id,
          action: 'metadata'
        })
      });
      
      if (response.ok) {
        const metadata = await response.json();
        const properFilename = metadata.filename || file.filename;
        
        updatedFiles.push({
          ...file,
          filename: properFilename,
          bytes: metadata.size_bytes || file.bytes
        });
      } else {
        console.warn(`Failed to fetch metadata for ${file.file_id}:`, response.status);
        updatedFiles.push(file);
      }
    } catch (error) {
      console.error(`Error fetching metadata for file ${file.file_id}:`, error);
      updatedFiles.push(file);
    }
  }
  return updatedFiles;
}