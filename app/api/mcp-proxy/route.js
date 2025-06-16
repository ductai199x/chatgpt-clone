/**
 * MCP (Model Context Protocol) Proxy API Route
 * 
 * This Next.js API route serves as a server-side proxy for MCP server communication,
 * solving CORS restrictions and providing unified transport handling for different
 * MCP transport protocols.
 * 
 * SUPPORTED TRANSPORT PROTOCOLS:
 * 
 * 1. SSE (Server-Sent Events) Transport:
 *    - Required for OpenAI MCP connector compatibility
 *    - Uses persistent connections with session management
 *    - Handles async request/response correlation via JSON-RPC IDs
 *    - Endpoints: /sse
 * 
 * 2. Streamable-HTTP Transport:
 *    - Used by most MCP servers (e.g., DeepWiki)
 *    - Direct HTTP POST requests with optional session management
 *    - Handles both JSON and SSE-formatted responses
 *    - Endpoints: /mcp
 * 
 * KEY FEATURES:
 * 
 * - SSE Session Manager: Maintains persistent SSE connections for OpenAI compatibility
 * - Transport Detection: Automatically detects available transport protocols
 * - Session Management: Handles MCP session lifecycle and request correlation
 * - CORS Handling: Provides proper CORS headers for browser compatibility
 * - Error Normalization: Standardizes error responses across transport types
 * - Authentication: Supports Bearer token authentication forwarding
 * 
 * USAGE FROM CLIENT:
 * 
 * 1. Transport Detection (HEAD request):
 *    GET /api/mcp-proxy?url=https://mcp.server.com/sse
 * 
 * 2. SSE Session Creation:
 *    POST /api/mcp-proxy
 *    { targetUrl, authToken, transport: 'sse-create-session' }
 * 
 * 3. SSE Session Requests:
 *    POST /api/mcp-proxy  
 *    { sessionId, mcpRequest, transport: 'sse-session-request' }
 * 
 * 4. Direct Streamable-HTTP:
 *    POST /api/mcp-proxy
 *    { targetUrl, mcpRequest, authToken, sessionId? }
 * 
 * INTEGRATION:
 * 
 * - Used by lib/api/mcp-service.js for MCP server validation and tool discovery
 * - Supports both OpenAI (requires SSE) and Anthropic (works with both transports)
 * - Handles MCP protocol sequence: initialize → notifications/initialized → tools/list
 */

// CORS headers for all responses
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Helper function to create JSON responses with CORS
function createResponse(data, status = 200, additionalHeaders = {}) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
        ...additionalHeaders,
      }
    }
  );
}

// Helper function to create error responses
function createErrorResponse(error, status = 500, details = null) {
  const errorData = details ? { error, details } : { error };
  return createResponse(errorData, status);
}

// Global SSE session manager
class SSESessionManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> { connection, pendingRequests }
    this.cleanup();
  }
  
  async createSession(baseUrl, authToken) {
    const sessionId = `sse-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    try {
      const sseUrl = `${baseUrl}/sse`;
      const headers = {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      };
      
      if (authToken && authToken.trim()) {
        headers['Authorization'] = `Bearer ${authToken.trim()}`;
      }
      
      console.log(`SSE Manager: Creating session ${sessionId} to ${sseUrl}`);
      
      const response = await fetch(sseUrl, {
        method: 'GET',
        headers,
      });
      
      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get SSE reader');
      }
      
      const session = {
        sessionId,
        baseUrl,
        authToken,
        reader,
        decoder: new TextDecoder(),
        pendingRequests: new Map(), // requestId -> { resolve, reject, timestamp }
        endpointUrl: null,
        isReady: false,
        lastActivity: Date.now()
      };
      
      this.sessions.set(sessionId, session);
      
      // Start reading SSE events
      this.startReading(session);
      
      // Wait for endpoint URL to be received
      await this.waitForReady(session);
      
      return sessionId;
      
    } catch (error) {
      console.error(`SSE Manager: Failed to create session ${sessionId}:`, error);
      throw error;
    }
  }
  
  async startReading(session) {
    try {
      while (true) {
        const { done, value } = await session.reader.read();
        if (done) {
          console.log(`SSE Manager: Session ${session.sessionId} stream ended`);
          break;
        }
        
        const chunk = session.decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('event: endpoint')) {
            continue;
          }
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            
            if (!session.isReady) {
              // This should be the endpoint URL
              session.endpointUrl = data.startsWith('/') ? session.baseUrl + data : data;
              session.isReady = true;
              console.log(`SSE Manager: Session ${session.sessionId} ready with endpoint: ${session.endpointUrl}`);
            } else {
              // This should be a JSON-RPC response
              try {
                const jsonResponse = JSON.parse(data);
                this.handleResponse(session, jsonResponse);
              } catch (parseError) {
                console.error(`SSE Manager: Failed to parse JSON response:`, parseError, data);
              }
            }
          }
        }
        
        session.lastActivity = Date.now();
      }
    } catch (error) {
      console.error(`SSE Manager: Error reading session ${session.sessionId}:`, error);
      this.closeSession(session.sessionId);
    }
  }
  
  async waitForReady(session, timeout = 10000) {
    const start = Date.now();
    while (!session.isReady && (Date.now() - start) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!session.isReady) {
      throw new Error('Timeout waiting for SSE session to be ready');
    }
  }
  
  handleResponse(session, jsonResponse) {
    console.log(`SSE Manager: Received response for session ${session.sessionId}:`, jsonResponse);
    
    if (jsonResponse.id) {
      const pending = session.pendingRequests.get(jsonResponse.id);
      if (pending) {
        session.pendingRequests.delete(jsonResponse.id);
        pending.resolve(jsonResponse);
      } else {
        console.warn(`SSE Manager: No pending request found for ID ${jsonResponse.id}`);
      }
    }
  }
  
  async sendRequest(sessionId, mcpRequest, timeout = 30000) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    if (!session.isReady) {
      throw new Error(`Session ${sessionId} not ready`);
    }
    
    // Check if this is a notification (no id field and method starts with 'notifications/')
    const isNotification = !mcpRequest.id && mcpRequest.method && mcpRequest.method.startsWith('notifications/');
    
    if (isNotification) {
      // Handle notifications differently - they don't expect responses
      try {
        const postHeaders = {
          'Content-Type': 'application/json',
        };
        
        if (session.authToken && session.authToken.trim()) {
          postHeaders['Authorization'] = `Bearer ${session.authToken.trim()}`;
        }
        
        console.log(`SSE Manager: Sending notification ${mcpRequest.method} to ${session.endpointUrl}`);
        
        const response = await fetch(session.endpointUrl, {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify(mcpRequest),
        });
        
        console.log(`SSE Manager: Notification response status: ${response.status}`);
        
        // For notifications, we accept 200 OK or 202 Accepted
        if (response.status === 200 || response.status === 202) {
          return { result: { status: 'accepted', message: 'Notification sent successfully' } };
        } else {
          throw new Error(`Notification failed with status: ${response.status}`);
        }
        
      } catch (error) {
        throw new Error(`Notification failed: ${error.message}`);
      }
    }
    
    // Handle regular requests with responses
    return new Promise(async (resolve, reject) => {
      // Set up pending request tracking
      const timeoutId = setTimeout(() => {
        session.pendingRequests.delete(mcpRequest.id);
        reject(new Error('Request timeout'));
      }, timeout);
      
      session.pendingRequests.set(mcpRequest.id, {
        resolve: (response) => {
          clearTimeout(timeoutId);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        timestamp: Date.now()
      });
      
      try {
        // Send the request to the session endpoint
        const postHeaders = {
          'Content-Type': 'application/json',
        };
        
        if (session.authToken && session.authToken.trim()) {
          postHeaders['Authorization'] = `Bearer ${session.authToken.trim()}`;
        }
        
        console.log(`SSE Manager: Sending request ${mcpRequest.id} to ${session.endpointUrl}`);
        
        const response = await fetch(session.endpointUrl, {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify(mcpRequest),
        });
        
        console.log(`SSE Manager: POST response status for ${mcpRequest.id}: ${response.status}`);
        
        // For SSE, we expect 202 Accepted and the response will come via SSE
        if (response.status !== 202) {
          session.pendingRequests.delete(mcpRequest.id);
          clearTimeout(timeoutId);
          reject(new Error(`Unexpected response status: ${response.status}`));
        }
        
      } catch (error) {
        session.pendingRequests.delete(mcpRequest.id);
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }
  
  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      console.log(`SSE Manager: Closing session ${sessionId}`);
      
      // Reject all pending requests
      for (const [, pending] of session.pendingRequests) {
        pending.reject(new Error('Session closed'));
      }
      
      // Close the reader
      try {
        session.reader.releaseLock();
      } catch (error) {
        console.warn(`SSE Manager: Error releasing reader for ${sessionId}:`, error);
      }
      
      this.sessions.delete(sessionId);
    }
  }
  
  // Cleanup old sessions
  cleanup() {
    setInterval(() => {
      const now = Date.now();
      const maxAge = 5 * 60 * 1000; // 5 minutes
      
      for (const [sessionId, session] of this.sessions) {
        if (now - session.lastActivity > maxAge) {
          console.log(`SSE Manager: Cleaning up inactive session ${sessionId}`);
          this.closeSession(sessionId);
        }
      }
    }, 60000); // Check every minute
  }
  
  getSessionInfo(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? {
      sessionId: session.sessionId,
      endpointUrl: session.endpointUrl,
      isReady: session.isReady,
      pendingRequests: session.pendingRequests.size,
      lastActivity: session.lastActivity
    } : null;
  }
}

// Global instance
const sseManager = new SSESessionManager();

export async function POST(request) {
  try {
    const body = await request.json();
    const { targetUrl, mcpRequest, authToken, sessionId, transport } = body;

    // Handle new SSE session creation
    if (transport === 'sse-create-session') {
      if (!targetUrl) {
        return createErrorResponse('Target URL is required for session creation', 400);
      }
      try {
        const url = new URL(targetUrl);
        const baseUrl = `${url.protocol}//${url.host}`;
        const sessionId = await sseManager.createSession(baseUrl, authToken);
        
        return createResponse({
          success: true,
          sessionId,
          sessionInfo: sseManager.getSessionInfo(sessionId)
        });
      } catch (error) {
        return createErrorResponse('Failed to create SSE session', 500, error.message);
      }
    }

    // Handle SSE session requests using persistent connections
    if (transport === 'sse-session-request') {
      if (!sessionId) {
        return createErrorResponse('Session ID required for SSE session requests', 400);
      }

      if (!mcpRequest) {
        return createErrorResponse('MCP request required', 400);
      }

      try {
        const response = await sseManager.sendRequest(sessionId, mcpRequest);
        
        return createResponse(response);
      } catch (error) {
        return createErrorResponse('SSE session request failed', 500, error.message);
      }
    }

    // Handle regular streamable-http requests
    // For all requests, targetUrl is required
    if (!targetUrl) {
      return createErrorResponse('Target URL is required', 400);
    }

    if (!mcpRequest) {
      return createErrorResponse('MCP request body is required', 400);
    }

    // Prepare headers for the MCP server request
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream', // Required for FastMCP streamable-http
    };

    // Add authentication if provided
    if (authToken && authToken.trim()) {
      headers['Authorization'] = `Bearer ${authToken.trim()}`;
    }
    
    // Add session ID if provided (for FastMCP streamable-http)
    if (sessionId && sessionId.trim()) {
      headers['mcp-session-id'] = sessionId.trim();
    }

    // Make the request to the MCP server with redirect following
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(mcpRequest),
      redirect: 'follow' // Follow redirects automatically
    });

    // Handle different response types
    let responseData;
    const contentType = response.headers.get('content-type');
    
    if (!response.ok) {
      // Handle error responses
      let errorMessage;
      try {
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || `Server error: ${response.status}`;
        } else {
          errorMessage = await response.text();
        }
      } catch (parseError) {
        errorMessage = `Server returned ${response.status}: ${response.statusText}`;
      }

      return createResponse({ 
        error: {
          code: response.status,
          message: errorMessage
        }
      }, response.status);
    }

    // Handle successful responses
    try {
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else if (contentType && contentType.includes('text/event-stream')) {
        // Handle SSE response from FastMCP streamable-http
        const textData = await response.text();
        
        // Parse SSE format: "event: message\r\ndata: {json}\r\n\r\n"
        const dataMatch = textData.match(/data:\s*(.+)/);
        if (dataMatch) {
          try {
            responseData = JSON.parse(dataMatch[1].trim());
          } catch (jsonError) {
            responseData = {
              error: {
                code: -1,
                message: `Failed to parse SSE JSON data: ${jsonError.message}`
              }
            };
          }
        } else {
          responseData = {
            error: {
              code: -1,
              message: `No data found in SSE response: ${textData}`
            }
          };
        }
      } else {
        // Non-JSON, non-SSE response
        const textData = await response.text();
        
        // Handle 202 Accepted responses for SSE POST requests
        if (response.status === 202 && (textData === 'Accepted' || textData.trim() === 'Accepted')) {
          responseData = {
            result: {
              status: 'accepted',
              message: 'Request accepted by SSE endpoint'
            }
          };
        } else {
          responseData = {
            error: {
              code: -1,
              message: `Server returned unexpected response type: ${textData}`
            }
          };
        }
      }
    } catch (parseError) {
      responseData = {
        error: {
          code: -1,
          message: `Failed to parse server response: ${parseError.message}`
        }
      };
    }

    // Extract session ID from response headers if present and forward it
    const mcpSessionId = response.headers.get('mcp-session-id');
    const additionalHeaders = mcpSessionId ? { 'mcp-session-id': mcpSessionId } : {};

    // Return the MCP server response with CORS headers
    return createResponse(responseData, 200, additionalHeaders);

  } catch (error) {
    console.error('MCP Proxy error:', error);
    return createErrorResponse('Proxy request failed', 500, error.message);
  }
}


// Handle preflight OPTIONS requests for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: CORS_HEADERS,
  });
}


// Also handle HEAD requests for connectivity testing
export async function HEAD(request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return new Response(null, { 
        status: 400,
        headers: CORS_HEADERS
      });
    }

    // Test connectivity to the target MCP server
    const response = await fetch(targetUrl, {
      method: 'HEAD',
      timeout: 5000,
    });

    return new Response(null, {
      status: response.status,
      headers: CORS_HEADERS,
    });

  } catch (error) {
    return new Response(null, {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}

