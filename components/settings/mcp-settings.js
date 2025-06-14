'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/lib/store/settings-store';
import MCPClient from '@/lib/api/mcp-client';

export default function MCPSettings() {
  const {
    mcp,
    setMcpServerUrl,
    setMcpAuthToken,
    setMcpAvailableTools,
  } = useSettingsStore();

  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const client = new MCPClient(mcp.mcpServerUrl, mcp.authToken);
      const result = await client.initialize({ host: 'chatgpt-clone' });
      const tools = (result.tools || []).map(t => ({ ...t, enabled: false, source: 'mcp' }));
      setMcpAvailableTools(tools);
    } catch (err) {
      console.error('MCP connect failed:', err);
      alert('Failed to connect to MCP server');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setMcpAvailableTools([]);
  };

  const isConnected = mcp.availableTools.length > 0;

  return (
    <div className="space-y-4">
      <div className="settings-item">
        <Label htmlFor="mcp-url">Server URL</Label>
        <Input
          id="mcp-url"
          value={mcp.mcpServerUrl}
          onChange={(e) => setMcpServerUrl(e.target.value)}
          placeholder="https://mcp.example.com/rpc"
        />
      </div>
      <div className="settings-item">
        <Label htmlFor="mcp-token">Auth Token</Label>
        <Input
          id="mcp-token"
          type="password"
          value={mcp.authToken}
          onChange={(e) => setMcpAuthToken(e.target.value)}
        />
      </div>
      <Button type="button" onClick={isConnected ? handleDisconnect : handleConnect} disabled={isConnecting}>
        {isConnected ? 'Disconnect' : 'Connect'}
      </Button>
    </div>
  );
}
