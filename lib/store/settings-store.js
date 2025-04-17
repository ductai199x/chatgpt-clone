'use client';

import { create } from 'zustand';

// Default providers configuration
const defaultProviders = {
  openai: {
    name: 'OpenAI',
    apiKey: '',
    models: [
      { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o-latest' },
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4o', name: 'GPT-4o' },
    ],
  },
  anthropic: {
    name: 'Anthropic',
    apiKey: '',
    models: [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    ],
  },
  google: {
    name: 'Google',
    apiKey: '',
    models: [
      { id: 'gemini-2.5-pro-preview-03-25', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite' },
    ],
  },
};

// Default settings
const defaultSettings = {
  providers: defaultProviders,
  currentProvider: 'openai',
  currentModel: 'chatgpt-4o-latest',
  theme: 'dark',
  systemPrompt: 'You are a helpful assistant.',
  interface: {
    showModelName: true,
    showTimestamps: true,
    autoTitleConversations: true,
  },
};

// Create the store
export const useSettingsStore = create((set, get) => ({
  // State
  ...defaultSettings,
  
  // Actions
  setCurrentProvider: (providerId) => {
    // Get the first available model for this provider
    const provider = get().providers[providerId];
    const firstModelId = provider?.models?.[0]?.id || '';
    
    set({
      currentProvider: providerId,
      currentModel: firstModelId,
    });
    localStorage.setItem('ai-settings', JSON.stringify({
      ...get(),
      currentProvider: providerId,
      currentModel: firstModelId,
    }));
  },
  
  setCurrentModel: (modelId) => {
    set({ currentModel: modelId });
    localStorage.setItem('ai-settings', JSON.stringify({
      ...get(),
      currentModel: modelId,
    }));
  },
  
  setApiKey: (providerId, apiKey) => {
    const updatedProviders = {
      ...get().providers,
      [providerId]: {
        ...get().providers[providerId],
        apiKey,
      },
    };
    
    set({ providers: updatedProviders });
    localStorage.setItem('ai-settings', JSON.stringify({
      ...get(),
      providers: updatedProviders,
    }));
  },
  
  setSystemPrompt: (systemPrompt) => {
    set({ systemPrompt });
    localStorage.setItem('ai-settings', JSON.stringify({
      ...get(),
      systemPrompt,
    }));
  },
  
  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem('ai-settings', JSON.stringify({
      ...get(),
      theme,
    }));
  },
  
  setInterfaceSetting: (key, value) => {
    set({
      interface: {
        ...get().interface,
        [key]: value,
      },
    });
    localStorage.setItem('ai-settings', JSON.stringify({
      ...get(),
      interface: {
        ...get().interface,
        [key]: value,
      },
    }));
  },
  
  // Load settings from localStorage
  loadSettings: () => {
    if (typeof window === 'undefined') return;
    
    try {
      const savedSettings = JSON.parse(localStorage.getItem('ai-settings') || '{}');
      
      // Only update if there are saved settings
      if (Object.keys(savedSettings).length > 0) {
        set({
          ...defaultSettings, // Ensure defaults for any new fields
          ...savedSettings,
          providers: {
            ...defaultSettings.providers, // Ensure we always have the latest provider configs
            ...savedSettings.providers,
          },
        });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },
  
  // Reset settings to defaults
  resetSettings: () => {
    set(defaultSettings);
    localStorage.setItem('ai-settings', JSON.stringify(defaultSettings));
  },
}));