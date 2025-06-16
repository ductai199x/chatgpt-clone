'use client';

/**
 * MCP (Model Context Protocol) Server Validation Service
 * Handles validation, connection testing, and tool discovery for MCP servers
 */

/**
 * Validates an MCP server and discovers available tools
 * @param {string} url - The MCP server URL
 * @param {string} authToken - Optional authentication token
 * @returns {Promise<{success: boolean, tools?: Array, error?: string}>}
 */
export async function validateMcpServer(url, authToken = '') {
  try {
    // Validate URL format
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'Invalid URL provided' };
    }

    let serverUrl;
    try {
      serverUrl = new URL(url);
    } catch (error) {
      return { success: false, error: 'Invalid URL format' };
    }

    // Check if URL uses supported protocols
    if (!['http:', 'https:'].includes(serverUrl.protocol)) {
      return { success: false, error: 'Only HTTP and HTTPS protocols are supported' };
    }

    // Prepare headers for MCP server requests
    const headers = {
      'Content-Type': 'application/json',
    };

    // Add authentication if token is provided
    if (authToken && authToken.trim()) {
      headers['Authorization'] = `Bearer ${authToken.trim()}`;
    }

    // Test server connectivity and discover tools
    const discoverResult = await discoverMcpTools(url, headers);
    
    if (!discoverResult.success) {
      return discoverResult;
    }

    return {
      success: true,
      tools: discoverResult.tools || [],
      transport: discoverResult.transport,
      endpointUrl: discoverResult.endpointUrl
    };

  } catch (error) {
    console.error('MCP server validation error:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to validate MCP server' 
    };
  }
}

/**
 * Discovers tools available on an MCP server using JSON-RPC protocol
 * Tries SSE first (for OpenAI compatibility), then falls back to streamable-http
 */
async function discoverMcpTools(url, headers) {
  try {
    // Detect transports
    const transports = await detectMcpTransports(url);
    console.log('Detected transports:', transports.detected);
    
    // Try SSE first (for OpenAI compatibility)
    if (transports.sse) {
      console.log('Trying SSE transport...');
      const sseResult = await discoverWithSSE(url, headers);
      if (sseResult.success) return sseResult;
      console.log('SSE failed, trying streamable-http...');
    }
    
    // Try streamable-http 
    if (transports.streamableHttp) {
      console.log('Trying streamable-http transport...');
      const httpResult = await discoverWithStreamableHttp(url, headers);
      if (httpResult.success) return httpResult;
    }
    
    // No fallback - all transports failed
    return { success: false, error: 'All detected transports failed' };
    
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'Connection timeout' };
    }
    return { success: false, error: `Discovery failed: ${error.message}` };
  }
}

/**
 * Simple SSE discovery - get session endpoint, then make regular POST requests
 */
async function discoverWithSSE(url, headers) {
  try {
    console.log('SSE: Using new persistent session manager');
    
    // Step 1: Create persistent SSE session
    const sessionResponse = await fetch('/api/mcp-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: url,
        authToken: headers['Authorization']?.replace('Bearer ', '') || '',
        transport: 'sse-create-session'
      }),
    });

    if (!sessionResponse.ok) {
      const errorData = await sessionResponse.json();
      return { success: false, error: `Failed to create SSE session: ${errorData.error}` };
    }

    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.sessionId;
    
    console.log('SSE: Created session:', sessionId, sessionData.sessionInfo);
    
    // Step 2: Send initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: generateRequestId(),
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {
          roots: { listChanged: true },
          sampling: {}
        },
        clientInfo: {
          name: 'chatgpt-clone-client',
          version: '1.0.0'
        }
      }
    };

    const initResponse = await fetch('/api/mcp-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        mcpRequest: initRequest,
        transport: 'sse-session-request'
      }),
    });

    if (!initResponse.ok) {
      const errorData = await initResponse.json();
      return { success: false, error: `SSE initialization failed: ${errorData.error}` };
    }

    const initData = await initResponse.json();
    
    if (initData.error) {
      return { success: false, error: `MCP initialization error: ${initData.error.message}` };
    }
    
    console.log('SSE: Initialization successful:', initData.result);
    
    // Step 3: Send initialized notification
    const initializedNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    };

    const notificationResponse = await fetch('/api/mcp-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        mcpRequest: initializedNotification,
        transport: 'sse-session-request'
      }),
    });

    // Notifications don't have responses, but check if the request was accepted
    if (!notificationResponse.ok) {
      console.warn('SSE: Initialized notification failed:', notificationResponse.status);
    } else {
      console.log('SSE: Initialized notification sent');
    }
    
    // Step 4: List tools
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: generateRequestId(),
      method: 'tools/list',
      params: {}
    };

    const toolsResponse = await fetch('/api/mcp-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        mcpRequest: listToolsRequest,
        transport: 'sse-session-request'
      }),
    });

    if (!toolsResponse.ok) {
      const errorData = await toolsResponse.json();
      return { success: false, error: `SSE tools request failed: ${errorData.error}` };
    }

    const toolsData = await toolsResponse.json();
    
    if (toolsData.error) {
      return { success: false, error: `MCP tools error: ${toolsData.error.message}` };
    }

    if (!toolsData.result) {
      return { success: false, error: 'No result in tools/list response' };
    }

    const tools = toolsData.result?.tools || [];
    console.log('SSE: Successfully got tools:', tools.length);
    
    return {
      success: true,
      tools: tools.map(tool => normalizeToolObject(tool)),
      transport: 'sse',
      endpointUrl: `${url.endsWith('/') ? url + 'sse' : url + '/sse'}`, // SSE endpoint for providers
      sessionId // Return session ID for future use
    };

  } catch (error) {
    return { success: false, error: `SSE discovery failed: ${error.message}` };
  }
}

/**
 * Simple streamable-http discovery 
 */
async function discoverWithStreamableHttp(url, headers) {
  try {
    const initResponse = await initializeWithStreamableHttp(url, headers);
    if (!initResponse.success) return initResponse;
    
    // Use the SAME session for tools/list
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: generateRequestId(),
      method: 'tools/list',
      params: {}
    };

    const proxyRequest = {
      targetUrl: initResponse.endpointUrl,
      mcpRequest: listToolsRequest,
      authToken: headers['Authorization']?.replace('Bearer ', '') || '',
      sessionId: initResponse.sessionId
    };

    const response = await fetch('/api/mcp-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyRequest),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    if (data.error) {
      return { success: false, error: data.error.message || 'MCP error' };
    }

    const tools = data.result?.tools || [];
    return {
      success: true,
      tools: tools.map(tool => normalizeToolObject(tool)),
      transport: 'streamable-http',
      endpointUrl: initResponse.endpointUrl // Use the endpoint from initialization
    };

  } catch (error) {
    return { success: false, error: error.message };
  }
}


/**
 * Detect which MCP transport protocols are supported by the server
 * @param {string} url - The MCP server URL
 * @returns {Promise<{sse: boolean, streamableHttp: boolean, detected: string[]}>}
 */
async function detectMcpTransports(url) {
  const detected = [];
  
  // Test for SSE transport
  try {
    const sseEndpoint = `${url.endsWith('/') ? url + 'sse' : url + '/sse'}`;
    const sseResponse = await fetch(`/api/mcp-proxy?url=${encodeURIComponent(sseEndpoint)}`, {
      method: 'HEAD',
    });
    
    if (sseResponse.ok || sseResponse.status === 405) { // 405 = Method Not Allowed is fine for HEAD
      detected.push('sse');
      console.log('SSE transport detected at:', sseEndpoint);
    } else {
      console.log(`SSE transport not available at ${sseEndpoint}: ${sseResponse.status}`);
    }
  } catch (error) {
    console.log('SSE transport not available:', error.message);
  }
  
  // Test for streamable-http transport (without trailing slash)
  try {
    const streamableEndpoint = `${url.endsWith('/') ? url + 'mcp' : url + '/mcp'}`;
    const streamableResponse = await fetch(`/api/mcp-proxy?url=${encodeURIComponent(streamableEndpoint)}`, {
      method: 'HEAD',
    });
    
    if (streamableResponse.ok || streamableResponse.status === 405) {
      detected.push('streamable-http');
      console.log('Streamable-HTTP transport detected at:', streamableEndpoint);
    } else {
      console.log(`Streamable-HTTP transport not available at ${streamableEndpoint}: ${streamableResponse.status}`);
    }
  } catch (error) {
    console.log('Streamable-HTTP transport not available:', error.message);
  }
  
  return {
    sse: detected.includes('sse'),
    streamableHttp: detected.includes('streamable-http'),
    detected
  };
}



/**
 * Initialize MCP connection using streamable-http transport
 * @param {string} url - The MCP server URL
 * @param {Object} headers - Request headers
 * @returns {Promise<{success: boolean, sessionId?: string, endpointUrl?: string, error?: string}>}
 */
async function initializeWithStreamableHttp(url, headers) {
  try {
    const initRequest = {
      jsonrpc: '2.0',
      id: generateRequestId(),
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {
          roots: { listChanged: true },
          sampling: {}
        },
        clientInfo: {
          name: 'chatgpt-clone-client',
          version: '1.0.0'
        }
      }
    };

    const endpoint = `${url.endsWith('/') ? url + 'mcp' : url + '/mcp'}`;
    console.log('Trying streamable-http initialization with endpoint:', endpoint);
    
    const proxyRequest = {
      targetUrl: endpoint,
      mcpRequest: initRequest,
      authToken: headers['Authorization']?.replace('Bearer ', '') || ''
    };

    const response = await fetch('/api/mcp-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(proxyRequest),
    });

    if (response.ok) {
      const data = await response.json();
      
      if (data.result && !data.error) {
        const sessionId = response.headers.get('mcp-session-id');
        console.log('Session ID from streamable-http initialization:', sessionId);

        // Send initialized notification
        const initializedNotification = {
          jsonrpc: '2.0',
          method: 'notifications/initialized'
        };

        const notificationRequest = {
          targetUrl: endpoint,
          mcpRequest: initializedNotification,
          authToken: headers['Authorization']?.replace('Bearer ', '') || '',
          sessionId: sessionId
        };

        await fetch('/api/mcp-proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(notificationRequest),
        });

        console.log('Successfully initialized streamable-http MCP connection');

        return { 
          success: true, 
          endpointUrl: endpoint,
          sessionId: sessionId,
          serverInfo: data.result
        };
      }
    } else {
      const errorText = await response.text();
      return {
        success: false,
        error: `Streamable-http server returned ${response.status}: ${errorText}`
      };
    }

    return {
      success: false,
      error: 'Streamable-http initialization failed'
    };
  } catch (error) {
    return {
      success: false,
      error: `Streamable-http connection failed: ${error.message}`
    };
  }
}

/**
 * Generate a unique request ID for JSON-RPC
 * @returns {string} Unique request ID
 */
function generateRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}




/**
 * Normalize tool object to consistent format
 * @param {Object} tool - Raw tool object from server
 * @returns {Object} Normalized tool object
 */
function normalizeToolObject(tool) {
  return {
    name: tool.name || tool.id || 'Unknown Tool',
    description: tool.description || tool.summary || 'No description available',
    parameters: tool.parameters || tool.input_schema || tool.schema || {},
    type: tool.type || 'function',
    id: tool.id || tool.name || `tool-${Date.now()}`,
  };
}


