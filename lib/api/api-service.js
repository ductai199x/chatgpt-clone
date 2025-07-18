'use client';

/**
 * Base API service with common methods
 */
class ApiService {
  constructor() {
    this.baseUrl = '';
    this.apiKey = '';
  }

  /**
   * Sanitize server name to meet provider requirements
   * Must start with letter and contain only letters, digits, '-', '_'
   */
  sanitizeServerName(name) {
    if (!name || typeof name !== 'string') {
      return 'mcp_server';
    }

    // Replace spaces and other invalid characters with underscores
    let sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9\-_]/g, '_')
      .replace(/^[^a-z]+/, '') // Remove leading non-letters
      .replace(/_+/g, '_') // Collapse multiple underscores
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores

    // Ensure it starts with a letter
    if (!sanitized || !/^[a-z]/.test(sanitized)) {
      sanitized = 'mcp_' + (sanitized || 'server');
    }

    return sanitized;
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
      if (error.name === 'AbortError') {
        console.log('Request was cancelled');
        throw new Error('Request cancelled');
      }
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

  async chatCompletion(messages, modelId = 'gpt-4.1', options = {}, enabledTools = [], abortSignal = null) {
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

      // Convert enabled tools to OpenAI format
      const tools = enabledTools.map(tool => {
        if (tool.id === 'webSearch') {
          return {
            type: 'web_search_preview',
            search_context_size: tool.config?.searchContextSize || 'medium',
            user_location: tool.config?.userLocation || null,
          };
        } else if (tool.id === 'codeExecution') {
          return {
            type: 'code_interpreter',
            container: tool.config?.container || { type: 'auto' },
          };
        }
        return null;
      }).filter(Boolean);

      // Add MCP tools (only for OpenAI which has native MCP support)
      try {
        const { useSettingsStore } = await import('@/lib/store/settings-store');
        const mcpServers = useSettingsStore.getState().mcpServers.filter(
          server => server.enabled && server.status === 'connected'
        );

        // Group tools by server to avoid duplicate server_label entries
        mcpServers.forEach(server => {
          if (server.tools && server.tools.length > 0) {
            // Use the stored endpoint URL from validation
            const mcpEndpointUrl = server.endpointUrl || server.url;

            tools.push({
              type: 'mcp',
              server_label: this.sanitizeServerName(server.name),
              server_url: mcpEndpointUrl,
              allowed_tools: server.tools.map(tool => tool.name), // All tools from this server
              require_approval: 'never', // Could be configurable
              ...(server.authToken && { headers: { "Authorization": `Bearer ${server.authToken}` } }), // Add auth token if available
            });
          }
        });
      } catch (error) {
        console.warn('Failed to load MCP tools for OpenAI:', error);
      }

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
        ...(tools.length > 0 && { tools }),
      };

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
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
        data.output[0].content[0].type === 'output_text') {
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

  /**
   * Check if the model supports extended thinking
   */
  isThinkingCapableModel(modelId) {
    const thinkingModels = [
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-3-7-sonnet-20250219'
    ];
    return thinkingModels.includes(modelId);
  }

  async chatCompletion(messages, modelId = 'claude-3-7-sonnet-20250219', options = {}, enabledTools = [], abortSignal = null) {
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

      // Check if this model supports extended thinking
      const isReasoningModel = this.isThinkingCapableModel(modelId);

      const requestBody = {
        apiKey: this.apiKey,
        model: modelId,
        messages: messagesForApi, // Pass the filtered messages
        system: systemPrompt, // Pass the extracted system prompt
        max_tokens: options.maxTokens || 8192, // Anthropic uses max_tokens
        temperature: isReasoningModel ? 1 : options.temperature || 0.7, // Reasoning models must use temperature 1
        stream: shouldStream,
      };

      // Add thinking parameter for supported models
      if (isReasoningModel) {
        requestBody.thinking = {
          type: 'enabled',
          budget_tokens: 16000 // Default budget as recommended in docs
        };
      }

      // Build tools array and headers
      const tools = [];
      let needsBetaHeader = false;

      // Process enabled tools (web search, code execution)
      if (enabledTools && enabledTools.length > 0) {
        for (const tool of enabledTools) {
          if (tool.id === 'webSearch') {
            const webSearchTool = {
              type: 'web_search_20250305',
              name: 'web_search',
            };

            // Add optional parameters if configured
            if (tool.config.maxUses && tool.config.maxUses !== 5) {
              webSearchTool.max_uses = tool.config.maxUses;
            }
            if (tool.config.allowedDomains && tool.config.allowedDomains.length > 0) {
              webSearchTool.allowed_domains = tool.config.allowedDomains;
            }
            if (tool.config.blockedDomains && tool.config.blockedDomains.length > 0) {
              webSearchTool.blocked_domains = tool.config.blockedDomains;
            }
            if (tool.config.userLocation && tool.config.userLocation.trim()) {
              webSearchTool.user_location = tool.config.userLocation;
            }

            tools.push(webSearchTool);
          } else if (tool.id === 'codeExecution') {
            needsBetaHeader = true;
            tools.push({
              type: 'code_execution_20250522',
              name: 'code_execution',
            });
          }
        }
      }

      // Add MCP servers for Anthropic (using native MCP connector) - independent of other tools
      try {
        const { useSettingsStore } = await import('@/lib/store/settings-store');
        const mcpServers = useSettingsStore.getState().mcpServers.filter(
          server => server.enabled && server.status === 'connected'
        );

        if (mcpServers.length > 0) {
          // Anthropic uses a separate mcp_servers parameter, not in tools array
          requestBody.mcp_servers = mcpServers.map(server => {
            // Use the stored endpoint URL from validation
            const mcpEndpointUrl = server.endpointUrl || server.url;

            const mcpServer = {
              type: 'url',
              url: mcpEndpointUrl,
              name: this.sanitizeServerName(server.name), // Sanitize server name
              tool_configuration: {
                enabled: true,
                allowed_tools: server.tools.map(tool => tool.name)
              }
            };

            if (server.authToken) {
              mcpServer.authorization_token = server.authToken;
            }

            return mcpServer;
          });

          needsBetaHeader = true; // MCP requires beta header
        }
      } catch (error) {
        console.warn('Failed to load MCP servers for Anthropic:', error);
      }

      // Add tools to request body if any exist
      if (tools.length > 0) {
        requestBody.tools = tools;
      }

      // Add beta header info for code execution or MCP
      if (needsBetaHeader) {
        const betaHeaders = [];

        // Check for code execution tools
        if (tools.some(tool => tool.type === 'code_execution_20250522')) {
          betaHeaders.push('code-execution-2025-05-22');
        }

        // Check for MCP servers
        if (requestBody.mcp_servers && requestBody.mcp_servers.length > 0) {
          betaHeaders.push('mcp-client-2025-04-04');
        }

        if (betaHeaders.length > 0) {
          requestBody.betaHeaders = { 'anthropic-beta': betaHeaders.join(',') };
        }
      }

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
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
          provider: 'anthropic',
          isReasoningModel: isReasoningModel
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

  async chatCompletion(messages, modelId = 'gemini-2.5-pro-preview-03-25', options = {}, enabledTools = [], abortSignal = null) {
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
          // Enable thinking/reasoning for all Gemini models
          thinkingConfig: {
            thinkingBudget: -1, // Unlimited thinking budget
            includeThoughts: true // Include reasoning in response
          },
          // topP, topK etc. could be added here
        },
        // Add systemInstruction if extracted
        ...(systemInstruction && { systemInstruction }),
        stream: shouldStream,
      };

      // Add tools if enabled
      if (enabledTools && enabledTools.length > 0) {
        requestBody.tools = enabledTools.map(tool => {
          if (tool.id === 'webSearch') {
            return { google_search: {} }; // Correct format from docs
          } else if (tool.id === 'codeExecution') {
            return { code_execution: {} }; // Google's code execution tool format
          }
          return null;
        }).filter(Boolean);
      }

      // Note: MCP is not supported for Google/Gemini models
      // Google's MCP implementation requires client-side SDK integration
      // which is incompatible with our server-side API approach
      try {
        const { useSettingsStore } = await import('@/lib/store/settings-store');
        const mcpTools = useSettingsStore.getState().getMcpTools();

        if (mcpTools.length > 0) {
          console.warn('MCP servers are configured but not supported for Google/Gemini models. MCP tools will be ignored.');
        }
      } catch (error) {
        // Silently ignore if settings store is not available
      }

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
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
          provider: 'google',
          isReasoningModel: true, // All Gemini models now support reasoning with thinkingConfig
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