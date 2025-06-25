'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Check, Eye, EyeOff, XCircle } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settings-store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export default function ModelSettings() {
  const {
    currentProvider,
    currentModel,
    providers,
    temperature,
    maxTokens,
    setCurrentProvider,
    setCurrentModel,
    setApiKey,
    setProviderOption,
    setTemperature,
    setMaxTokens,
    getCurrentModelMaxTokens,
  } = useSettingsStore();

  const [showApiKey, setShowApiKey] = useState({
    openai: false,
    anthropic: false,
    google: false,
    local: false,
  });

  const [isApiKeyValid, setIsApiKeyValid] = useState({
    openai: providers.openai.apiKey ? validateApiKey('openai', providers.openai.apiKey, false).isValid : null,
    anthropic: providers.anthropic.apiKey ? validateApiKey('anthropic', providers.anthropic.apiKey, false).isValid : null,
    google: providers.google.apiKey ? validateApiKey('google', providers.google.apiKey, false).isValid : null,
    local: providers.local.apiKey ? true : null,
  });
  const [apiKeyError, setApiKeyError] = useState({
    openai: '',
    anthropic: '',
    google: '',
    local: '',
  });

  const toggleShowApiKey = (provider) => {
    setShowApiKey((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  function validateApiKey(provider, key, updateState = true) {
    const minLengths = { openai: 30, anthropic: 30, google: 20, local: 0 };
    let isValid = false;
    let message = '';

    if (provider === 'local') {
      isValid = true;
      message = '';
    } else if (!key) {
      message = 'API key is required';
    } else if (key.length < minLengths[provider]) {
      message = `API key should be at least ${minLengths[provider]} characters`;
    } else if (provider === 'openai' && !key.startsWith('sk-')) {
      message = 'OpenAI API key should start with "sk-"';
    } else {
      isValid = true;
      message = '';
    }

    if (updateState) {
      setIsApiKeyValid((prev) => ({ ...prev, [provider]: isValid }));
      setApiKeyError((prev) => ({ ...prev, [provider]: message }));
    }
    return { isValid, message };
  }

  const handleApiKeyChange = (provider, key) => {
    setApiKey(provider, key);
    validateApiKey(provider, key);
  };

  const handleApiKeyBlur = (provider) => {
    validateApiKey(provider, providers[provider].apiKey);
  };

  return (
    <>
      <div className="settings-section">
        <h3 className="settings-section-header">Model Configuration</h3>
        <div className="settings-item">
          <Label htmlFor="provider">AI Provider</Label>
          <Select
            id="provider"
            value={currentProvider}
            onValueChange={setCurrentProvider}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="google">Google AI</SelectItem>
              <SelectItem value="local">Local</SelectItem>
            </SelectContent>
          </Select>
          <p className="settings-item-description">
            Choose the AI provider to use for conversations.
          </p>
        </div>

        <div className="settings-item">
          <Label htmlFor="model">Model</Label>
          {currentProvider === 'local' ? (
            <Input
              id="model"
              value={currentModel}
              onChange={(e) => {
                setCurrentModel(e.target.value);
                setProviderOption('local', 'customModel', e.target.value);
              }}
              placeholder="Model name"
              className="w-full"
            />
          ) : (
            <Select
              id="model"
              value={currentModel}
              onValueChange={setCurrentModel}
              disabled={!providers[currentProvider]?.models?.length}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {providers[currentProvider]?.models?.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="settings-item-description">
            Choose the model for the selected provider.
          </p>
        </div>

        {currentProvider === 'local' && (
          <>
            <div className="settings-item">
              <Label htmlFor="local-base-url">Base URL</Label>
              <Input
                id="local-base-url"
                value={providers.local.baseUrl}
                onChange={(e) => setProviderOption('local', 'baseUrl', e.target.value)}
                placeholder="http://localhost:8000"
                className="w-full"
              />
              <p className="settings-item-description">Endpoint of your local API.</p>
            </div>
            <div className="settings-item-row">
              <div className="settings-item-label-desc">
                <Label htmlFor="local-stream">Stream responses</Label>
                <p className="settings-item-description">Enable if your API supports SSE.</p>
              </div>
              <div className="settings-item-control">
                <Switch
                  id="local-stream"
                  checked={providers.local.useStreaming}
                  onCheckedChange={(val) => setProviderOption('local', 'useStreaming', val)}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="settings-section">
        <h3 className="settings-section-header">Model Parameters</h3>
        <div className="settings-item">
          <Label htmlFor="temperature">
            Temperature: <span className="text-muted-foreground font-normal">{temperature.toFixed(1)}</span>
          </Label>
          <Slider
            id="temperature"
            min={0}
            max={1}
            step={0.1}
            value={[temperature]}
            onValueChange={(value) => setTemperature(value[0])}
            className="flex-1"
          />
          <p className="settings-item-description">
            Controls randomness. Lower values make responses more deterministic.
          </p>
        </div>

        <div className="settings-item">
          <Label htmlFor="max-tokens">
            Max Tokens 
            <span className="text-muted-foreground font-normal ml-2">
              (Limit: {getCurrentModelMaxTokens()})
            </span>
          </Label>
          <Input
            id="max-tokens"
            type="number"
            min={1}
            max={getCurrentModelMaxTokens()}
            step={1}
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 1)}
            className="w-full"
          />
          <p className="settings-item-description">
            Maximum number of tokens to generate in the response. Current model supports up to {getCurrentModelMaxTokens()} tokens.
          </p>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-header">API Keys</h3>
        {['openai', 'anthropic', 'google', 'local'].map((provider) => {
          const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
          const placeholder = {
            openai: 'sk-...',
            anthropic: 'sk-ant-...',
            google: 'AIza...',
            local: '',
          }[provider];

          return (
            <div key={provider} className="settings-item">
              <Label htmlFor={`${provider}-api-key`}>{providerName} API Key</Label>
              <div className="api-key-input-wrapper">
                <div className="api-key-input-container">
                  <Input
                    id={`${provider}-api-key`}
                    type={showApiKey[provider] ? 'text' : 'password'}
                    placeholder={placeholder}
                    value={providers[provider].apiKey}
                    onChange={(e) => handleApiKeyChange(provider, e.target.value)}
                    onBlur={() => handleApiKeyBlur(provider)}
                    className={cn(
                      "api-key-input",
                      apiKeyError[provider] && "input-invalid",
                      isApiKeyValid[provider] && "input-valid"
                    )}
                  />
                </div>
                {providers[provider].apiKey && (
                  isApiKeyValid[provider] ? (
                    <Check className={cn("api-key-validation-icon", "text-valid")} />
                  ) : apiKeyError[provider] ? (
                    <XCircle className={cn("api-key-validation-icon", "text-invalid")} />
                  ) : null
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => toggleShowApiKey(provider)}
                  className="api-key-toggle-button"
                >
                  {showApiKey[provider] ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  <span className="sr-only">
                    {showApiKey[provider] ? 'Hide' : 'Show'} API key
                  </span>
                </Button>
              </div>
              {apiKeyError[provider] && (
                <p className="text-sm text-invalid mt-1">
                  {apiKeyError[provider]}
                </p>
              )}
            </div>
          );
        })}

        <div className="rounded-md bg-muted p-3 mt-4">
          <p className="text-xs text-muted-foreground">
            <strong>Security Note:</strong> Your API keys are stored locally in your browser and are
            never sent to our servers. They are used only to authenticate your
            requests directly to the provider&apos;s API.
          </p>
        </div>
      </div>
    </>
  );
}