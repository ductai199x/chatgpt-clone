import { generateId } from '@/lib/utils';

/**
 * Generate a new conversation object
 */
export function generateNewConversation() {
  const id = generateId();
  return {
    id,
    title: 'New chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

export function formatDate(date) {
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(date).toLocaleDateString(undefined, options);
}

export function formatMessageTime(date) {
  const options = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
  return new Date(date).toLocaleTimeString(undefined, options);
}

/**
 * Generate a title for a conversation based on the first message
 */
export function generateConversationTitle(message) {
  // Truncate to max 30 characters
  if (!message || !message.content) return 'New chat';
  
  const content = typeof message.content === 'string' 
    ? message.content 
    : message.content.reduce((acc, part) => {
        if (part.type === 'text') {
          return acc + part.text;
        }
        return acc;
      }, '');
  
  if (!content) return 'New chat';

  const title = content.slice(0, 30);
  return title.length < content.length ? `${title}...` : title;
}

/**
 * Create a message object
 */
export function createMessage({ role, content, images = [] }) {
  // Handle content with images
  const messageContent = images.length > 0
    ? [
        { type: 'text', text: content },
        ...images.map(img => ({ type: 'image', imageUrl: img }))
      ]
    : content;

  return {
    id: generateId(),
    role,
    content: messageContent,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Format messages for API submission
 */
export function formatMessagesForProvider(messages, provider) {
  switch (provider) {
    case 'openai':
      return messages.map(message => {
        if (typeof message.content === 'string') {
          return {
            role: message.role,
            content: message.content,
          };
        } else {
          // Format for OpenAI content format with images
          return {
            role: message.role,
            content: message.content.map(part => {
              if (part.type === 'text') {
                return { type: 'text', text: part.text };
              } else if (part.type === 'image') {
                return {
                  type: 'image_url',
                  image_url: { url: part.imageUrl },
                };
              }
              return part;
            }),
          };
        }
      });
    
    case 'anthropic':
      return messages.map(message => {
        if (message.role === 'assistant') {
          return { role: 'assistant', content: message.content };
        } else if (message.role === 'user') {
          if (typeof message.content === 'string') {
            return { role: 'user', content: message.content };
          } else {
            // Format for Anthropic content format with images
            return {
              role: 'user',
              content: message.content.map(part => {
                if (part.type === 'text') {
                  return { type: 'text', text: part.text };
                } else if (part.type === 'image') {
                  return {
                    type: 'image',
                    source: { type: 'base64', media_type: 'image/jpeg', data: part.imageUrl.split(',')[1] },
                  };
                }
                return part;
              }),
            };
          }
        }
        return message;
      });
      
    case 'google':
      return messages.map(message => {
        if (message.role === 'assistant') {
          return { role: 'model', parts: [{ text: message.content }] };
        } else if (message.role === 'user') {
          if (typeof message.content === 'string') {
            return { role: 'user', parts: [{ text: message.content }] };
          } else {
            // Format for Google content format with images
            return {
              role: 'user',
              parts: message.content.map(part => {
                if (part.type === 'text') {
                  return { text: part.text };
                } else if (part.type === 'image') {
                  // For Google, we need to use base64 encoded images
                  return {
                    inline_data: {
                      mime_type: 'image/jpeg',
                      data: part.imageUrl.split(',')[1],
                    }
                  };
                }
                return part;
              }),
            };
          }
        }
        return message;
      });
      
    default:
      return messages;
  }
}