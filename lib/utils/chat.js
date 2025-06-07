import { ARTIFACT_INSTRUCTIONS } from './artifact-instruction';

/**
 * Formats a date string into a localized, readable date format (e.g., "April 17, 2025").
 * @param {string | Date} date - The date string or Date object to format.
 * @returns {string} The formatted date string.
 */
export function formatDate(date) {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  // Ensure input is a Date object for reliable formatting
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj instanceof Date && !isNaN(dateObj)
    ? dateObj.toLocaleDateString(undefined, options)
    : 'Invalid Date';
}

/**
 * Formats a date string into a localized, readable time format (e.g., "06:20:22 AM").
 * @param {string | Date} date - The date string or Date object to format.
 * @returns {string} The formatted time string.
 */
export function formatMessageTime(date) {
  const options = { hour: 'numeric', minute: '2-digit' }; // Simplified default format
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj instanceof Date && !isNaN(dateObj)
    ? dateObj.toLocaleTimeString(undefined, options)
    : 'Invalid Time';
}

/**
 * Formats messages from the active chain for submission to a specific AI provider's API.
 * Injects artifact context and continuation instructions into the final user message.
 * Adapts role names and content structure based on the provider's requirements.
 *
 * @param {object} params - Parameters for formatting.
 * @param {Array<object>} params.rawMessageChain - Array of message node objects from _getActiveMessageChain.
 * @param {string} params.artifactContextString - The pre-formatted <artifacts_context> string.
 * @param {string | object[]} params.currentUserContent - The content of the user message triggering the API call.
 * @param {string} params.provider - The AI provider ('openai', 'anthropic', 'google').
 * @param {string|null} [params.systemPrompt=null] - Optional user-defined system prompt.
 * @param {boolean} [params.isContinuation=false] - Flag indicating if this is a continuation request.
 * @returns {Array<object>} An array of formatted message objects suitable for the provider's API.
 */
export function formatMessagesForProvider({
  rawMessageChain,
  artifactContextString,
  currentUserContent,
  provider,
  systemPrompt = null,
  isContinuation = false,
}) {
  // --- 1. Construct Combined System Prompt ---
  let combinedSystemContent = '';
  const trimmedUserPrompt = systemPrompt?.trim() || '';

  if (trimmedUserPrompt) {
    combinedSystemContent += `<system_prompt>\n${trimmedUserPrompt}\n</system_prompt>\n\n`;
  } else {
    combinedSystemContent += `<system_prompt></system_prompt>\n\n`;
  }
  combinedSystemContent += `<artifact_instruction>\n${ARTIFACT_INSTRUCTIONS.trim()}\n</artifact_instruction>`;

  // --- 2. Prepare Message List & Inject Context ---
  const messagesToFormat = [];
  if (combinedSystemContent) {
    messagesToFormat.push({ role: 'system', content: combinedSystemContent });
  }

  // Add historical messages from the raw chain
  messagesToFormat.push(...rawMessageChain.map(node => ({
    role: node.role,
    content: node.content, // Keep original content (string or array) for now
  })));

  // --- Inject context and continuation prompt into the *current* user message ---
  let finalUserContentStringOrArray = currentUserContent;
  let contextPrefix = artifactContextString || ''; // Start with artifact context
  if (isContinuation) {
    contextPrefix += `Please continue exactly where you left off, completing the previous artifact.\n\n`;
  }

  if (contextPrefix) {
    if (typeof currentUserContent === 'string') {
      finalUserContentStringOrArray = contextPrefix + currentUserContent;
    } else if (Array.isArray(currentUserContent)) {
      // Find the text part and prepend, keep image parts as is
      const textPartIndex = currentUserContent.findIndex(part => part.type === 'text');
      if (textPartIndex !== -1) {
        const modifiedContent = [...currentUserContent]; // Create shallow copy
        modifiedContent[textPartIndex] = { ...modifiedContent[textPartIndex], text: contextPrefix + modifiedContent[textPartIndex].text };
        finalUserContentStringOrArray = modifiedContent;
      } else {
        // If no text part, prepend as a new text part
        finalUserContentStringOrArray = [{ type: 'text', text: contextPrefix }, ...currentUserContent];
      }
    } else {
      // Fallback if currentUserContent is unexpected type
      finalUserContentStringOrArray = contextPrefix + String(currentUserContent);
    }
  }
  // --- End Context Injection ---

  // Add the (potentially modified) current user message to the list
  messagesToFormat.push({ role: 'user', content: finalUserContentStringOrArray });

  // Helper to extract base64 data and mime type from data URI
  const parseDataUri = (dataUri) => {
    const match = dataUri.match(/^data:(.+);base64,(.*)$/);
    if (!match) return { mimeType: 'application/octet-stream', data: '' }; // Default fallback
    return { mimeType: match[1], data: match[2] };
  };

  switch (provider) {
    case 'openai':
      return messagesToFormat.map(message => {
        const role = message.role; // Keep 'system' role here; OpenAIService will filter it
        let content;
        if (typeof message.content === 'string') {
          content = message.content;
        } else { // Array format (multimodal)
          content = message.content.map(part => {
            if (part.type === 'text') {
              return { type: 'input_text', text: part.text };
            } else if (part.type === 'image_url' || (part.type === 'image' && part.imageUrl)) {
              return { type: 'input_image', image_url: part.imageUrl || part.image_url?.url };
            } else if (part.type === 'attachment') {
              // OpenAI format for file attachments (expects full data URI with mimetype)
              return { 
                type: 'input_file', 
                filename: part.fileName,
                file_data: part.fileData
              };
            }
            return null;
          }).filter(Boolean);
        }
        if (Array.isArray(content) && content.length === 0) content = '';
        return { role, content };
      });

    case 'anthropic':
      return messagesToFormat.map(message => {
        if (message.role === 'system') {
          return { role: 'system', content: message.content };
        }
        const role = message.role;
        let content;
        if (typeof message.content === 'string') {
          content = message.content;
          if (role === 'assistant' && Array.isArray(content)) {
            content = content.find(part => part.type === 'text')?.text || '';
          }
        } else { // Array format (multimodal - only allowed for user role)
          if (role === 'user') {
            content = message.content.map(part => {
              if (part.type === 'text') {
                return { type: 'text', text: part.text };
              } else if (part.type === 'image_url' || (part.type === 'image' && part.imageUrl)) {
                const imageUrl = part.imageUrl || part.image_url?.url;
                if (!imageUrl) return null;
                const { mimeType, data } = parseDataUri(imageUrl);
                return { type: 'image', source: { type: 'base64', media_type: mimeType, data } };
              } else if (part.type === 'attachment') {
                // For Anthropic, convert PDFs to document blocks with base64
                if (part.fileType === 'application/pdf') {
                  const { data } = parseDataUri(part.fileData);
                  return { 
                    type: 'document', 
                    source: { 
                      type: 'base64', 
                      media_type: 'application/pdf', 
                      data 
                    } 
                  };
                }
                // Other attachment types not supported by Anthropic yet
                return null;
              }
              return null;
            }).filter(Boolean);
          } else { // Assistant role with array content - extract text
            content = message.content.find(part => part.type === 'text')?.text || '';
          }
        }
        if (role === 'assistant' && Array.isArray(content)) content = '';
        if (role === 'user' && Array.isArray(content) && content.length === 0) content = '';
        return { role, content };
      }).filter(Boolean);

    case 'google':
      return messagesToFormat.map(message => {
        const role = message.role === 'assistant' ? 'model' : message.role;
        if (role !== 'user' && role !== 'model' && role !== 'system') return null;

        let parts = [];
        if (typeof message.content === 'string') {
          parts.push({ text: message.content });
        } else { // Array format (multimodal)
          parts = message.content.map(part => {
            if (part.type === 'text') {
              return { text: part.text };
            } else if (part.type === 'image_url' || (part.type === 'image' && part.imageUrl)) {
              const imageUrl = part.imageUrl || part.image_url?.url;
              if (!imageUrl) return null;
              const { mimeType, data } = parseDataUri(imageUrl);
              return { inline_data: { mime_type: mimeType, data } };
            }
            return null;
          }).filter(Boolean);
        }
        if (parts.length === 0) {
          if (role === 'system') parts.push({ text: '' });
          else return null;
        }
        return { role, parts };
      }).filter(Boolean);

    default:
      console.warn(`[formatMessagesForProvider] Unknown provider: ${provider}. Returning basic format.`);
      return messagesToFormat.map(m => ({ role: m.role, content: m.content }));
  }
}