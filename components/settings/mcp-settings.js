'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { 
  Plus, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock,
  Eye,
  EyeOff,
  Server,
  Wrench,
  AlertTriangle
} from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settings-store';
import { cn } from '@/lib/utils';

export default function McpSettings() {
  const {
    mcpServers,
    addMcpServer,
    deleteMcpServer,
    toggleMcpServer,
    validateMcpServer,
    currentProvider,
  } = useSettingsStore();

  const [showForm, setShowForm] = useState(false);
  const [newServer, setNewServer] = useState({
    name: '',
    url: '',
    authToken: '',
  });
  const [showAuthTokens, setShowAuthTokens] = useState({});
  const [formErrors, setFormErrors] = useState({});

  const handleAddServer = async () => {
    // Validate form
    const errors = {};
    if (!newServer.name.trim()) {
      errors.name = 'Server name is required';
    }
    if (!newServer.url.trim()) {
      errors.url = 'Server URL is required';
    } else {
      try {
        new URL(newServer.url);
      } catch (e) {
        errors.url = 'Invalid URL format';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    // Add server and validate
    const serverId = addMcpServer(newServer.name, newServer.url, newServer.authToken);
    
    // Reset form
    setNewServer({ name: '', url: '', authToken: '' });
    setFormErrors({});
    setShowForm(false);

    // Trigger validation
    if (serverId) {
      await validateMcpServer(serverId);
    }
  };

  const handleRetryValidation = async (serverId) => {
    await validateMcpServer(serverId);
  };

  const toggleAuthTokenVisibility = (serverId) => {
    setShowAuthTokens(prev => ({
      ...prev,
      [serverId]: !prev[serverId]
    }));
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'validating':
        return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'error':
        return 'Error';
      case 'validating':
        return 'Validating...';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">MCP Servers</h3>
          <p className="text-sm text-muted-foreground">
            Configure Model Context Protocol servers to extend AI capabilities
          </p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Server
        </Button>
      </div>

      {/* Google Provider Warning */}
      {currentProvider === 'google' && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h4 className="font-medium text-amber-800">MCP Not Supported for Google Models</h4>
          </div>
          <p className="text-sm text-amber-700 mt-2">
            Google/Gemini models don&apos;t currently support server-side MCP integration. 
            MCP servers configured here will only work with OpenAI and Anthropic models.
          </p>
        </div>
      )}

      {/* Add Server Form */}
      {showForm && (
        <div className="rounded-lg border p-4 space-y-4">
          <h4 className="font-medium">Add New MCP Server</h4>
          
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="server-name">Server Name</Label>
              <Input
                id="server-name"
                placeholder="e.g., Git MCP"
                value={newServer.name}
                onChange={(e) => setNewServer(prev => ({ ...prev, name: e.target.value }))}
                className={cn(formErrors.name && "border-red-500")}
              />
              {formErrors.name && (
                <p className="text-sm text-red-500 mt-1">{formErrors.name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="server-url">Server URL</Label>
              <Input
                id="server-url"
                placeholder="https://example.com/mcp"
                value={newServer.url}
                onChange={(e) => setNewServer(prev => ({ ...prev, url: e.target.value }))}
                className={cn(formErrors.url && "border-red-500")}
              />
              {formErrors.url && (
                <p className="text-sm text-red-500 mt-1">{formErrors.url}</p>
              )}
            </div>

            <div>
              <Label htmlFor="auth-token">Authentication Token (Optional)</Label>
              <Input
                id="auth-token"
                type="password"
                placeholder="Bearer token for authentication"
                value={newServer.authToken}
                onChange={(e) => setNewServer(prev => ({ ...prev, authToken: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleAddServer}>Add Server</Button>
            <Button variant="outline" onClick={() => {
              setShowForm(false);
              setNewServer({ name: '', url: '', authToken: '' });
              setFormErrors({});
            }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Server List */}
      <div className="space-y-4">
        {mcpServers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No MCP servers configured</p>
            <p className="text-sm">Add a server to extend AI capabilities</p>
          </div>
        ) : (
          mcpServers.map((server) => (
            <div
              key={server.id}
              className="rounded-lg border p-4 space-y-3"
            >
              {/* Server Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(server.status)}
                    <h4 className="font-medium">{server.name}</h4>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {getStatusText(server.status)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Enable/Disable Switch */}
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={() => toggleMcpServer(server.id)}
                    disabled={server.status !== 'connected'}
                  />
                  
                  {/* Retry Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRetryValidation(server.id)}
                    disabled={server.status === 'validating'}
                  >
                    <RefreshCw className={cn(
                      "h-4 w-4",
                      server.status === 'validating' && "animate-spin"
                    )} />
                  </Button>

                  {/* Delete Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMcpServer(server.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Server Details */}
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">URL: </span>
                  <span className="font-mono">{server.url}</span>
                </div>

                {server.authToken && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Auth Token: </span>
                    <span className="font-mono">
                      {showAuthTokens[server.id] 
                        ? server.authToken 
                        : '•'.repeat(server.authToken.length)
                      }
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleAuthTokenVisibility(server.id)}
                    >
                      {showAuthTokens[server.id] ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                )}

                {server.lastValidated && (
                  <div>
                    <span className="text-muted-foreground">Last validated: </span>
                    <span>{new Date(server.lastValidated).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Error Display */}
              {server.error && (
                <div className="rounded-md bg-red-50 p-3 border border-red-200">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-red-700 font-medium">Error:</span>
                  </div>
                  <p className="text-sm text-red-600 mt-1">{server.error}</p>
                </div>
              )}

              {/* Tools Display */}
              {server.tools && server.tools.length > 0 && (
                <div className="rounded-md bg-green-50 p-3 border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-700 font-medium">
                      Available Tools ({server.tools.length})
                    </span>
                  </div>
                  <div className="space-y-1">
                    {server.tools.slice(0, 3).map((tool, index) => (
                      <div key={index} className="text-sm">
                        <span className="font-mono text-green-800">{tool.name}</span>
                        {tool.description && (
                          <span className="text-green-600 ml-2">- {tool.description}</span>
                        )}
                      </div>
                    ))}
                    {server.tools.length > 3 && (
                      <div className="text-sm text-green-600">
                        ... and {server.tools.length - 3} more tools
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Summary */}
      {mcpServers.length > 0 && (
        <div className="rounded-lg bg-muted p-4">
          <h4 className="font-medium mb-2">Summary</h4>
          <div className="grid grid-cols-2 gap-4 text-sm mb-3">
            <div>
              <span className="text-muted-foreground">Total servers: </span>
              <span>{mcpServers.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Active servers: </span>
              <span>{mcpServers.filter(s => s.enabled && s.status === 'connected').length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total tools: </span>
              <span>
                {mcpServers
                  .filter(s => s.enabled && s.status === 'connected')
                  .reduce((total, server) => total + (server.tools?.length || 0), 0)
                }
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Compatible providers: </span>
              <span>OpenAI, Anthropic</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground border-t pt-2">
            <strong>Note:</strong> MCP servers work with OpenAI and Anthropic models only. 
            Google/Gemini models require client-side MCP integration which is not currently supported.
          </div>
        </div>
      )}
    </div>
  );
}