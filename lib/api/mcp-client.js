'use client';

export default class MCPClient {
  constructor(serverUrl = '', authToken = '') {
    this.serverUrl = serverUrl;
    this.authToken = authToken;
    this.idCounter = 1;
    this.resources = [];
    this.prompts = [];
    this.tools = [];
  }

  setConnection(serverUrl, authToken) {
    this.serverUrl = serverUrl;
    this.authToken = authToken;
  }

  async _sendRpcRequest(method, params = {}) {
    if (!this.serverUrl) {
      throw new Error('MCP server URL is not set');
    }
    const body = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.idCounter++,
    };
    const response = await fetch(this.serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || 'MCP RPC error');
    }
    return data.result;
  }

  async initialize(capabilities = {}) {
    const result = await this._sendRpcRequest('initialize', { capabilities });
    this.resources = result.resources || [];
    this.prompts = result.prompts || [];
    this.tools = result.tools || [];
    return result;
  }

  async callTool(toolId, params = {}) {
    return this._sendRpcRequest('callTool', { toolId, params });
  }
}
