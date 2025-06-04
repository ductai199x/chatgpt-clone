'use client';

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
      const shouldStream = options.stream === true;

      let systemPrompt = '';
      const messagesForApi = messages.filter(msg => {
        if (msg.role === 'system') {
          // Assuming system message content is always a string here
          systemPrompt = typeof msg.content === 'string' ? msg.content : '';
          return false; // Exclude system message from the main array
        }
        return true; // Keep user/assistant messages
      });

      const requestBody = {
        apiKey: this.apiKey,
        model: modelId,
        input: messagesForApi,
        instructions: systemPrompt,
        stream: shouldStream,
        max_output_tokens: modelId.toLowerCase().startsWith('o') ? null : options.maxTokens, // Let OpenAI handle max tokens for reasoning models
        temperature: modelId.toLowerCase().startsWith('o') ? null : options.temperature || 0.7, // Reasoning models do not use temperature
        reasoning: modelId.toLowerCase().startsWith('o') ? { effort: 'high', summary: 'auto' } : null,
        store: options.store || false, // Store the response if requested
      };

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `HTTP error! status: ${response.status}`);
      }

      // If streaming is enabled, return the stream
      if (shouldStream) {
        return {
          role: 'assistant',
          content: '',
          stream: response.body,
          provider: 'openai',
          isReasoningModel: modelId.toLowerCase().startsWith('o'),
        };
      }

      // Handle normal response
      const data = await response.json();
      // Adapt to the /responses API output structure
      // Assuming the primary text output is in the first output item, first content part
      let mainContent = '';
      if (data.output && data.output.length > 0 &&
        data.output[0].content && data.output[0].content.length > 0 &&
        data.output[0].content[0].type === 'text') {
        mainContent = data.output[0].content[0].text;
      } else if (data.output_text) {
        // Fallback for potential output_text if API provides it directly (though docs say SDK only)
        // Or if the backend route decided to aggregate it. For now, primary path is above.
        mainContent = data.output_text;
      }

      const result = {
        role: 'assistant',
        content: mainContent,
        provider: 'openai', // Added provider for consistency
      };

      if (data.reasoning && data.reasoning.summary) {
        result.reasoningSummary = data.reasoning.summary;
      }

      return result;
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
      // Extract system message and filter the messages array
      let systemPrompt = '';
      const messagesForApi = messages.filter(msg => {
        if (msg.role === 'system') {
          // Assuming system message content is always a string here
          systemPrompt = typeof msg.content === 'string' ? msg.content : '';
          return false; // Exclude system message from the main array
        }
        return true; // Keep user/assistant messages
      });

      const shouldStream = options.stream === true;

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: this.apiKey,
          model: modelId,
          messages: messagesForApi, // Pass the filtered messages
          system: systemPrompt || undefined, // Pass the extracted system prompt
          max_tokens: options.maxTokens || 8192, // Anthropic uses max_tokens
          temperature: options.temperature || 0.7,
          stream: shouldStream,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `HTTP error! status: ${response.status}`); // Access nested message
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
      // Anthropic's response structure might vary slightly, adjust if needed
      const content = data.content?.find(block => block.type === 'text')?.text || '';
      return {
        role: 'assistant',
        content: content,
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
      // Extract system message and filter the messages array for 'contents'
      let systemInstruction = null;
      const contentsForApi = messages.filter(msg => {
        if (msg.role === 'system') {
          // Extract text from parts for system instruction
          const systemText = msg.parts?.find(part => part.text)?.text || '';
          if (systemText) {
            systemInstruction = { role: "system", parts: [{ text: systemText }] }; // Format for systemInstruction
            // Or just: systemInstruction = { parts: [{ text: systemText }] }; if API expects that
          }
          return false; // Exclude system message from 'contents'
        }
        // Ensure only user/model roles remain for 'contents'
        return msg.role === 'user' || msg.role === 'model';
      });

      const shouldStream = options.stream === true;

      const requestBody = {
        apiKey: this.apiKey,
        model: modelId,
        contents: contentsForApi, // Pass filtered user/model messages
        generationConfig: {
          temperature: options.temperature || 0.7,
          maxOutputTokens: options.maxTokens,
          // topP, topK etc. could be added here
        },
        // Add systemInstruction if extracted
        ...(systemInstruction && { systemInstruction }),
        stream: shouldStream,
      };

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || `HTTP error! status: ${response.status}`); // Access nested message
      }

      // If streaming is enabled, return the stream
      if (shouldStream) {
        return {
          role: 'assistant', // Representing 'model' role internally
          content: '',
          stream: response.body,
          provider: 'google'
        };
      }

      // Handle normal response
      const data = await response.json();

      // Extract text content from response (handle potential lack of candidates/content/parts)
      const content = data.candidates?.[0]?.content?.parts?.find(part => part.text)?.text || '';

      return {
        role: 'assistant', // Representing 'model' role internally
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