import { generateId } from '@/lib/utils';

/**
 * Generates a new, empty conversation object.
 * @returns {object} A new conversation object with default values.
 */
export function generateNewConversation() {
  const id = generateId();
  return {
    id,
    title: 'New chat', // Default title
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: {}, // Use a map for efficient message node lookup by ID
    firstMessageId: null, // Pointer to the start of the message chain
  };
}

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
 * Creates a new message node object with versioning support.
 * Includes an initial version containing the provided content.
 * @param {object} params - Parameters for message creation.
 * @param {'user' | 'assistant'} params.role - The role of the message sender.
 * @param {string | object[]} params.content - The message content (string or array for multimodal).
 * @param {string[]} [params.images=[]] - Optional array of image data URIs for multimodal messages.
 * @returns {object} A new message node object.
 */
export function createMessage({ role, content, images = [] }) {
  const messageId = generateId();
  const versionId = generateId();

  // Structure content for potential multimodality
  const messageContent = images && images.length > 0
    ? [
        { type: 'text', text: content }, // Ensure text part exists even if content is empty initially
        ...images.map(imgDataUri => ({ type: 'image', imageUrl: imgDataUri })) 
      ]
    : content; // Keep as string if no images

  const initialVersion = {
    id: versionId,
    content: messageContent,
    createdAt: new Date().toISOString(),
    nextMessageId: null,        // Pointer to the next message node in this branch
    nextMessageVersionId: null, // Pointer to the specific version of the next node
    // --- Initialize artifact-related fields ---
    isIncomplete: false,        // Flag indicating if the message ended mid-artifact
    incompleteArtifactId: null, // ID of the artifact if isIncomplete is true
    // --- End artifact-related fields ---
  };

  return {
    id: messageId,
    role,
    activeVersionId: versionId, // The first version is active by default
    versions: [initialVersion], // Array holding all versions of this message
  };
}

/**
 * Retrieves the sequence of message objects representing the currently active chain in a conversation.
 * Traverses from the first message, following the `nextMessageId` and `nextMessageVersionId` pointers
 * of the active versions. Can optionally stop traversal at a specific message/version.
 * @param {object} conversation - The conversation object.
 * @param {string|null} [endMessageId=null] - Optional ID of the message node to stop *at* (inclusive).
 * @param {string|null} [endVersionId=null] - Optional ID of the version within endMessageId to stop *at*. Required if endMessageId is provided.
 * @returns {Array<object>} An array of message objects { id, versionId, role, content, createdAt } for the active chain.
 */
export function getActiveMessageChain(conversation, endMessageId = null, endVersionId = null) {
  const messages = [];
  // Basic validation for a usable conversation structure
  if (!conversation?.messages || !conversation.firstMessageId) {
    return messages;
  }

  const messagesMap = conversation.messages;
  let currentMessageId = conversation.firstMessageId;
  let currentVersionId = messagesMap[currentMessageId]?.activeVersionId; // Start with the first node's active version

  while (currentMessageId && currentVersionId) {
    const messageNode = messagesMap[currentMessageId];
    // Ensure node exists
    if (!messageNode) {
       console.warn(`[getActiveMessageChain] Node ${currentMessageId} not found in conversation ${conversation.id}. Chain broken.`);
       break; 
    }

    const activeVersion = messageNode.versions.find(v => v.id === currentVersionId);
    // Ensure the specific version exists
    if (!activeVersion) {
       console.warn(`[getActiveMessageChain] Version ${currentVersionId} not found in node ${currentMessageId}. Chain broken.`);
       break; 
    }

    // Add the message data from the active version to the result list
    messages.push({
      id: messageNode.id,
      versionId: activeVersion.id,
      role: messageNode.role,
      content: activeVersion.content,
      createdAt: activeVersion.createdAt,
    });

    // Stop if we've reached the designated end point
    if (currentMessageId === endMessageId && currentVersionId === endVersionId) {
      break;
    }

    // Advance to the next message/version specified by the current active version's pointers
    currentMessageId = activeVersion.nextMessageId;
    currentVersionId = activeVersion.nextMessageVersionId;
  }

  return messages;
}

/**
 * Finds the ID and version ID of the last message in the currently active chain.
 * Traverses the active chain similar to getActiveMessageChain.
 * @param {object} conversation - The conversation object.
 * @returns {{ lastMessageId: string|null, lastVersionId: string|null }} The IDs of the last message and its active version.
 */
export function findLastActiveMessageInfo(conversation) {
  if (!conversation?.messages || !conversation.firstMessageId) {
    return { lastMessageId: null, lastVersionId: null };
  }
  
  const messagesMap = conversation.messages;
  let currentMessageId = conversation.firstMessageId;
  let currentVersionId = messagesMap[currentMessageId]?.activeVersionId;
  
  let lastMessageId = null;
  let lastVersionId = null;

  while (currentMessageId && currentVersionId) {
    const messageNode = messagesMap[currentMessageId];
    if (!messageNode) break; // Chain broken
    
    const activeVersion = messageNode.versions.find(v => v.id === currentVersionId);
    if (!activeVersion) break; // Chain broken

    // Update the last known good message/version
    lastMessageId = currentMessageId;
    lastVersionId = currentVersionId;

    // Move to the next following the pointers
    currentMessageId = activeVersion.nextMessageId;
    currentVersionId = activeVersion.nextMessageVersionId;
  }

  return { lastMessageId, lastVersionId };
};

/**
 * Finds the message node ID and version ID immediately preceding a target message node
 * within the currently active chain.
 * @param {object} conversation - The conversation object.
 * @param {string} targetMessageId - The ID of the message node whose predecessor is needed.
 * @returns {{ precedingMessageId: string|null, precedingVersionId: string|null }} The IDs of the preceding message and its active version.
 */
export function findPrecedingMessage(conversation, targetMessageId) {
  if (!conversation?.messages || !conversation.firstMessageId || !targetMessageId) {
    return { precedingMessageId: null, precedingVersionId: null };
  }

  const messagesMap = conversation.messages;
  let currentMessageId = conversation.firstMessageId;
  let currentVersionId = messagesMap[currentMessageId]?.activeVersionId;

  // If the target is the very first message, it has no predecessor
  if (currentMessageId === targetMessageId) {
    return { precedingMessageId: null, precedingVersionId: null };
  }

  while (currentMessageId && currentVersionId) {
    const node = messagesMap[currentMessageId];
    if (!node) break; // Chain broken

    const activeVersion = node.versions.find(v => v.id === currentVersionId);
    if (!activeVersion) break; // Chain broken

    // Check if the *next* message pointed to by this active version is our target
    if (activeVersion.nextMessageId === targetMessageId) {
      // We found the predecessor node and its active version
      return { precedingMessageId: currentMessageId, precedingVersionId: currentVersionId };
    }

    // Advance to the next message/version in the active chain
    currentMessageId = activeVersion.nextMessageId;
    currentVersionId = activeVersion.nextMessageVersionId;
  }

  // Traversed the chain without finding the target as a 'next' message
  console.warn(`[findPrecedingMessage] Target ${targetMessageId} not found as a successor in the active chain of conversation ${conversation.id}.`);
  return { precedingMessageId: null, precedingVersionId: null };
}

/**
 * Generates a short title for a conversation based on the text content
 * of the first user message in the currently active chain.
 * @param {object} conversation - The conversation object.
 * @returns {string} A generated title (e.g., "Explain quantum...") or "New chat".
 */
export function generateConversationTitle(conversation) {
  const activeChain = getActiveMessageChain(conversation); // Get the current active chain
  const firstUserMessage = activeChain.find(msg => msg.role === 'user');

  if (!firstUserMessage?.content) return 'New chat'; // No user message or content found

  // Extract text content, handling both string and array formats
  const textContent = typeof firstUserMessage.content === 'string'
    ? firstUserMessage.content
    : firstUserMessage.content
        .filter(part => part.type === 'text') // Filter for text parts
        .map(part => part.text) // Extract text
        .join(' '); // Join multiple text parts if they exist

  if (!textContent.trim()) return 'New chat'; // Content is empty or whitespace

  const maxLength = 35; // Max length for the title
  const trimmedContent = textContent.trim();
  const title = trimmedContent.slice(0, maxLength);
  
  // Add ellipsis if the content was truncated
  return title.length < trimmedContent.length ? `${title}...` : title;
}

/**
 * Formats messages from the active chain for submission to a specific AI provider's API.
 * Adapts the role names and content structure (especially for multimodal messages)
 * based on the provider's requirements.
 * @param {object} conversation - The conversation object.
 * @param {string} provider - The AI provider ('openai', 'anthropic', 'google').
 * @param {string|null} [systemPrompt=null] - Optional system prompt to include.
 * @param {string|null} [endMessageId=null] - Optional ID of the message node to stop formatting at (inclusive).
 * @param {string|null} [endVersionId=null] - Optional ID of the version within endMessageId to stop at.
 * @returns {Array<object>} An array of formatted message objects suitable for the provider's API.
 */
export function formatMessagesForProvider(conversation, provider, systemPrompt = null, endMessageId = null, endVersionId = null) {
  const activeChain = getActiveMessageChain(conversation, endMessageId, endVersionId);

  // Prepend system prompt if provided
  const messagesToFormat = systemPrompt
    ? [{ role: 'system', content: systemPrompt, id: 'system', versionId: 'system' }, ...activeChain]
    : activeChain;

  // Helper to extract base64 data and mime type from data URI
  const parseDataUri = (dataUri) => {
     const match = dataUri.match(/^data:(.+);base64,(.*)$/);
     if (!match) return { mimeType: 'application/octet-stream', data: '' }; // Default fallback
     return { mimeType: match[1], data: match[2] };
  };

  switch (provider) {
    case 'openai':
      return messagesToFormat.map(message => {
        if (message.role === 'system') {
           return { role: 'system', content: message.content };
        }
        // Format user/assistant messages
        const role = message.role; // 'user' or 'assistant'
        let content;
        if (typeof message.content === 'string') {
          content = message.content;
        } else { // Array format (multimodal)
          content = message.content.map(part => {
            if (part.type === 'text') {
              return { type: 'text', text: part.text };
            } else if (part.type === 'image' && part.imageUrl) {
              // OpenAI expects { type: 'image_url', image_url: { url: "data:..." } }
              return { type: 'image_url', image_url: { url: part.imageUrl } };
            }
            return null;
          }).filter(Boolean); // Remove nulls from invalid parts
        }
        return { role, content };
      }).filter(Boolean); // Filter out potential nulls if system message wasn't handled (shouldn't happen)

    case 'anthropic':
       // Anthropic expects alternating user/assistant. System prompt handled separately.
       // Service layer should handle system prompt extraction and role validation.
       return messagesToFormat.map(message => {
         if (message.role === 'system') {
           // Include system message for service layer to potentially use
           return { role: 'system', content: message.content };
         } 
         
         const role = message.role; // 'user' or 'assistant'
         let content;

         if (typeof message.content === 'string') {
           content = message.content;
           // Anthropic requires assistant content to be string, user can be string or array
           if (role === 'assistant' && Array.isArray(content)) {
              content = content.find(part => part.type === 'text')?.text || ''; // Extract text for assistant
           }
         } else { // Array format (multimodal - only allowed for user role)
           if (role === 'user') {
             content = message.content.map(part => {
               if (part.type === 'text') {
                 return { type: 'text', text: part.text };
               } else if (part.type === 'image' && part.imageUrl) {
                 // Anthropic expects { type: 'image', source: { type: 'base64', media_type: ..., data: ... } }
                 const { mimeType, data } = parseDataUri(part.imageUrl);
                 return { type: 'image', source: { type: 'base64', media_type: mimeType, data } };
               }
               return null;
             }).filter(Boolean);
           } else { // Assistant role with array content - extract text
              content = message.content.find(part => part.type === 'text')?.text || '';
           }
         }
         // Ensure assistant content is not an empty array if derived from multimodal
         if (role === 'assistant' && Array.isArray(content)) {
             content = '';
         }
         // Ensure user content is not an empty array if it only contained invalid parts
         if (role === 'user' && Array.isArray(content) && content.length === 0) {
             content = ''; // Send empty string instead of empty array
         }

         return { role, content };
       }).filter(Boolean); // Filter out potential nulls

    case 'google':
      // Google expects alternating user/model roles. System prompt handled separately.
      // Service layer should handle system prompt extraction and role validation.
      return messagesToFormat.map(message => {
        // Map roles: assistant -> model, keep user, keep system (for service layer)
        const role = message.role === 'assistant' ? 'model' : message.role; 
        if (role !== 'user' && role !== 'model' && role !== 'system') return null;

        let parts = [];
        if (typeof message.content === 'string') {
          parts.push({ text: message.content });
        } else { // Array format (multimodal)
          parts = message.content.map(part => {
            if (part.type === 'text') {
              return { text: part.text };
            } else if (part.type === 'image' && part.imageUrl) {
              // Google expects { inline_data: { mime_type: ..., data: ... } }
              const { mimeType, data } = parseDataUri(part.imageUrl);
              return { inline_data: { mime_type: mimeType, data } };
            }
            return null;
          }).filter(Boolean);
        }
        
        // Avoid sending empty parts array if content was invalid
        if (parts.length === 0) {
           // If the original role was system, keep it as system with empty text
           if (role === 'system') {
              parts.push({ text: '' }); 
           } else {
              // For user/model, skip message if no valid parts
              return null; 
           }
        }

        return { role, parts };
      }).filter(Boolean); // Filter out nulls from invalid roles or empty parts

    default:
      console.warn(`[formatMessagesForProvider] Unknown provider: ${provider}. Returning basic format.`);
      // Fallback: Return basic structure, potentially including system prompt
      return messagesToFormat.map(m => ({ role: m.role, content: m.content }));
  }
}