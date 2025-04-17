'use client';

import { formatMessagesForProvider } from '@/lib/utils/conversation';

/**
 * Base API service with common methods
 */
class ApiService {
  constructor() {
    this.baseUrl = '';
    this.apiKey = '';
  }
  
  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }
  
  async sendRequest(url, options) {
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `HTTP error! status: ${response.status}`);
      }
      
      return response;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }
}

/**
 * OpenAI API service
 */
export class OpenAIService extends ApiService {
  constructor(apiKey = '') {
    super();
    this.baseUrl = '/api/openai'; // Use local API route
    this.apiKey = apiKey;
  }
  
  async chatCompletion(messages, modelId = 'gpt-4.1', options = {}) {
    try {
      const formattedMessages = formatMessagesForProvider(messages, 'openai');
      const shouldStream = options.stream === true;
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: this.apiKey,
          endpoint: 'chat/completions',
          model: modelId,
          messages: formattedMessages,
          stream: shouldStream,
          max_tokens: options.maxTokens,
          temperature: options.temperature || 0.7,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      // If streaming is enabled, return the stream
      if (shouldStream) {
        return {
          role: 'assistant',
          content: '',
          stream: response.body,
          provider: 'openai'
        };
      }
        
      // Handle normal response
      const data = await response.json();
      return {
        role: 'assistant',
        content: data.choices[0].message.content,
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}

/**
 * Anthropic API service
 */
export class AnthropicService extends ApiService {
  constructor(apiKey = '') {
    super();
    this.baseUrl = '/api/anthropic'; // Use local API route
    this.apiKey = apiKey;
  }
  
  async chatCompletion(messages, modelId = 'claude-3-7-sonnet-20250219', options = {}) {
    try {
      // Extract system message if it exists
      let systemPrompt = '';
      let formattedMessages = [...messages];
      
      if (formattedMessages.length > 0 && formattedMessages[0].role === 'system') {
        systemPrompt = formattedMessages[0].content;
        formattedMessages.shift(); // Remove system message from array
      }
      
      // Format remaining messages for Anthropic
      formattedMessages = formatMessagesForProvider(formattedMessages, 'anthropic');
      const shouldStream = options.stream === true;
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: this.apiKey,
          model: modelId,
          messages: formattedMessages,
          system: systemPrompt || undefined,
          max_tokens: options.maxTokens || 4096,
          temperature: options.temperature || 0.7,
          stream: shouldStream,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      // If streaming is enabled, return the stream
      if (shouldStream) {
        return {
          role: 'assistant',
          content: '',
          stream: response.body,
          provider: 'anthropic'
        };
      }
      
      // Handle normal response
      const data = await response.json();
      return {
        role: 'assistant',
        content: data.content[0].text,
      };
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw new Error(`Anthropic API error: ${error.message}`);
    }
  }
}

/**
 * Google AI (Gemini) API service
 */
export class GoogleAIService extends ApiService {
  constructor(apiKey = '') {
    super();
    this.baseUrl = '/api/google'; // Use local API route
    this.apiKey = apiKey;
  }
  
  async chatCompletion(messages, modelId = 'gemini-2.5-pro-preview-03-25', options = {}) {
    try {
      const formattedMessages = formatMessagesForProvider(messages, 'google');
      const shouldStream = options.stream === true;
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: this.apiKey,
          model: modelId,
          contents: formattedMessages,
          generationConfig: {
            temperature: options.temperature || 0.7,
            maxOutputTokens: options.maxTokens,
          },
          stream: shouldStream,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      // If streaming is enabled, return the stream
      if (shouldStream) {
        return {
          role: 'assistant',
          content: '',
          stream: response.body,
          provider: 'google'
        };
      }
      
      // Handle normal response
      const data = await response.json();
      
      // Extract text content from response
      const content = data.candidates[0].content.parts[0].text;
      
      return {
        role: 'assistant',
        content,
      };
    } catch (error) {
      console.error('Google AI API error:', error);
      throw new Error(`Google AI API error: ${error.message}`);
    }
  }
}

/**
 * Factory to create appropriate API service
 */
export function createApiService(provider, apiKey) {
  switch (provider) {
    case 'openai':
      return new OpenAIService(apiKey);
    case 'anthropic':
      return new AnthropicService(apiKey);
    case 'google':
      return new GoogleAIService(apiKey);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}