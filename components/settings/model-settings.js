'use client';

import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Check, Eye, EyeOff } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/settings-store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
    setTemperature,
    setMaxTokens,
  } = useSettingsStore();
  
  const [showApiKey, setShowApiKey] = useState({
    openai: false,
    anthropic: false,
    google: false,
  });
  
  const [apiKeyValidation, setApiKeyValidation] = useState({
    openai: { isValid: false, message: '' },
    anthropic: { isValid: false, message: '' },
    google: { isValid: false, message: '' },
  });
  
  // Toggle API key visibility
  const toggleShowApiKey = (provider) => {
    setShowApiKey((prev) => ({
      ...prev,
      [provider]: !prev[provider],
    }));
  };
  
  // Validate API key on input
  const validateApiKey = (provider, key) => {
    const minLengths = {
      openai: 30,
      anthropic: 30,
      google: 20,
    };
    
    let isValid = false;
    let message = '';
    
    if (!key) {
      message = 'API key is required';
    } else if (key.length < minLengths[provider]) {
      message = `API key should be at least ${minLengths[provider]} characters`;
    } else if (provider === 'openai' && !key.startsWith('sk-')) {
      message = 'OpenAI API key should start with "sk-"';
      isValid = false;
    } else {
      isValid = true;
      message = 'Valid API key';
    }
    
    setApiKeyValidation((prev) => ({
      ...prev,
      [provider]: { isValid, message },
    }));
    
    return isValid;
  };
  
  // Handle API key change
  const handleApiKeyChange = (provider, key) => {
    setApiKey(provider, key);
    validateApiKey(provider, key);
  };
  
  // Handle API key validation on blur
  const handleApiKeyBlur = (provider) => {
    validateApiKey(provider, providers[provider].apiKey);
  };
  
  return (
    <div className="space-y-6">
      {/* Provider selection */}
      <div className="space-y-2">
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
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Choose the AI provider to use for conversations.
        </p>
      </div>
      
      {/* Model selection */}
      <div className="space-y-2">
        <Label htmlFor="model">Model</Label>
        <Select
          id="model"
          value={currentModel}
          onValueChange={setCurrentModel}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {providers[currentProvider].models.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Choose the model to use for the selected provider.
        </p>
      </div>

      {/* Temperature Setting */}
      <div className="space-y-3">
        <Label htmlFor="temperature">Temperature</Label>
        <div className="flex items-center space-x-4">
          <Slider
            id="temperature"
            min={0}
            max={1}
            step={0.1}
            value={[temperature]}
            onValueChange={(value) => setTemperature(value[0])}
            className="flex-1"
          />
          <span className="w-12 text-right text-sm text-muted-foreground">
            {temperature.toFixed(1)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Controls randomness. Lower values make responses more deterministic.
        </p>
      </div>

      {/* Max Tokens Setting */}
      <div className="space-y-2">
        <Label htmlFor="max-tokens">Max Tokens</Label>
        <Input
          id="max-tokens"
          type="number"
          min={1}
          step={1}
          value={maxTokens}
          onChange={(e) => setMaxTokens(e.target.value)}
          className="w-full"
        />
        <p className="text-sm text-muted-foreground">
          Maximum number of tokens to generate in the response.
        </p>
      </div>
      
      {/* API Key management section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">API Keys</h3>
        
        {/* OpenAI API Key */}
        <div className="space-y-2">
          <Label htmlFor="openai-api-key">OpenAI API Key</Label>
          <div className="flex gap-10">
            <div className="relative flex-1 min-w-0">
              <Input
                id="openai-api-key"
                type={showApiKey.openai ? 'text' : 'password'}
                placeholder="sk-..."
                value={providers.openai.apiKey}
                onChange={(e) => handleApiKeyChange('openai', e.target.value)}
                onBlur={() => handleApiKeyBlur('openai')}
                className={
                  apiKeyValidation.openai.message
                    ? apiKeyValidation.openai.isValid
                      ? 'border-chatgpt-teal'
                      : 'border-destructive'
                    : ''
                }
              />
              {apiKeyValidation.openai.isValid && providers.openai.apiKey && (
                <Check className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-chatgpt-teal" />
              )}
            </div>
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={() => toggleShowApiKey('openai')}
            >
              {showApiKey.openai ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              <span className="sr-only">
                {showApiKey.openai ? 'Hide' : 'Show'} API key
              </span>
            </Button>
          </div>
          {apiKeyValidation.openai.message && (
            <p
              className={`text-sm ${
                apiKeyValidation.openai.isValid
                  ? 'text-chatgpt-teal'
                  : 'text-destructive'
              }`}
            >
              {apiKeyValidation.openai.message}
            </p>
          )}
        </div>
        
        {/* Anthropic API Key */}
        <div className="space-y-2">
          <Label htmlFor="anthropic-api-key">Anthropic API Key</Label>
          <div className="flex gap-10">
            <div className="relative flex-1 min-w-0">
              <Input
                id="anthropic-api-key"
                type={showApiKey.anthropic ? 'text' : 'password'}
                placeholder="sk_ant_..."
                value={providers.anthropic.apiKey}
                onChange={(e) => handleApiKeyChange('anthropic', e.target.value)}
                onBlur={() => handleApiKeyBlur('anthropic')}
                className={
                  apiKeyValidation.anthropic.message
                    ? apiKeyValidation.anthropic.isValid
                      ? 'border-chatgpt-teal'
                      : 'border-destructive'
                    : ''
                }
              />
              {apiKeyValidation.anthropic.isValid && providers.anthropic.apiKey && (
                <Check className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-chatgpt-teal" />
              )}
            </div>
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={() => toggleShowApiKey('anthropic')}
            >
              {showApiKey.anthropic ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              <span className="sr-only">
                {showApiKey.anthropic ? 'Hide' : 'Show'} API key
              </span>
            </Button>
          </div>
          {apiKeyValidation.anthropic.message && (
            <p
              className={`text-sm ${
                apiKeyValidation.anthropic.isValid
                  ? 'text-chatgpt-teal'
                  : 'text-destructive'
              }`}
            >
              {apiKeyValidation.anthropic.message}
            </p>
          )}
        </div>
        
        {/* Google API Key */}
        <div className="space-y-2">
          <Label htmlFor="google-api-key">Google AI API Key</Label>
          <div className="flex gap-10">
            <div className="relative flex-1 min-w-0">
              <Input
                id="google-api-key"
                type={showApiKey.google ? 'text' : 'password'}
                placeholder="AIza..."
                value={providers.google.apiKey}
                onChange={(e) => handleApiKeyChange('google', e.target.value)}
                onBlur={() => handleApiKeyBlur('google')}
                className={
                  apiKeyValidation.google.message
                    ? apiKeyValidation.google.isValid
                      ? 'border-chatgpt-teal'
                      : 'border-destructive'
                    : ''
                }
              />
              {apiKeyValidation.google.isValid && providers.google.apiKey && (
                <Check className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-chatgpt-teal" />
              )}
            </div>
            <Button
              variant="outline"
              size="icon"
              type="button"
              onClick={() => toggleShowApiKey('google')}
            >
              {showApiKey.google ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              <span className="sr-only">
                {showApiKey.google ? 'Hide' : 'Show'} API key
              </span>
            </Button>
          </div>
          {apiKeyValidation.google.message && (
            <p
              className={`text-sm ${
                apiKeyValidation.google.isValid
                  ? 'text-chatgpt-teal'
                  : 'text-destructive'
              }`}
            >
              {apiKeyValidation.google.message}
            </p>
          )}
        </div>
      </div>
      
      {/* API Key security note */}
      <div className="rounded-md bg-muted p-4">
        <p className="text-sm text-muted-foreground">
          <strong>Security Note:</strong> Your API keys are stored locally in your browser and are
          never sent to our servers. They are used only to authenticate your
          requests directly to the provider's API.
        </p>
      </div>
    </div>
  );
}