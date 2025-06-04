'use client';

import { create } from 'zustand';

// Default providers configuration
const defaultProviders = {
  openai: {
    name: 'OpenAI',
    apiKey: '',
    models: [
      { id: 'chatgpt-4o-latest', name: 'ChatGPT-4o-latest', maxTokens: 16384 },
      { id: 'gpt-4.1', name: 'GPT-4.1', maxTokens: 32768 },
      { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 16384 },
      { id: 'o3', name: 'o3', maxTokens: 100000 },
      { id: 'o3-mini', name: 'o3-mini', maxTokens: 100000 },
      { id: 'o4-mini', name: 'o4-mini', maxTokens: 100000 },
    ],
  },
  anthropic: {
    name: 'Anthropic',
    apiKey: '',
    models: [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', maxTokens: 64000 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', maxTokens: 8192 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', maxTokens: 8192 },
      { id: 'claude-opus-4-20250514', name: 'Claude 4 Opus', maxTokens: 32000 },
      { id: 'claude-sonnet-4-20250514', name: 'Claude 4 Sonnet', maxTokens: 64000 },
    ],
  },
  google: {
    name: 'Google',
    apiKey: '',
    models: [
      { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro Preview 05-06', maxTokens: 65536 },
      { id: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash Preview 05-20', maxTokens: 65536 },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite', maxTokens: 8192 },
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
  temperature: 0.7, // Added default temperature
  maxTokens: 32768,  // Added default maxTokens
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

  // New action for temperature
  setTemperature: (temperature) => {
    const tempValue = parseFloat(temperature); // Ensure it's a number
    if (isNaN(tempValue)) return; // Optional: Add validation if needed
    set({ temperature: tempValue });
    localStorage.setItem('ai-settings', JSON.stringify({
      ...get(),
      temperature: tempValue,
    }));
  },

  // New action for maxTokens
  setMaxTokens: (maxTokens) => {
    const tokensValue = parseInt(maxTokens, 10); // Ensure it's an integer
    if (isNaN(tokensValue) || tokensValue <= 0) return; // Optional: Add validation
    set({ maxTokens: tokensValue });
    localStorage.setItem('ai-settings', JSON.stringify({
      ...get(),
      maxTokens: tokensValue,
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
      
      // Merge saved settings with defaults, ensuring new defaults are included
      // if they weren't in the saved data.
      const mergedSettings = {
        ...defaultSettings,
        ...savedSettings,
        providers: { // Deep merge providers to keep default models/structure
          ...Object.keys(defaultProviders).reduce((acc, providerId) => {
            acc[providerId] = {
              ...defaultProviders[providerId], // Always use fresh default provider info (models, name)
              apiKey: savedSettings.providers?.[providerId]?.apiKey || '', // Only preserve API key from saved settings
            };
            return acc;
          }, {}),
        },
        interface: { // Deep merge interface settings
          ...defaultSettings.interface,
          ...(savedSettings.interface || {}),
        },
      };

      // Always update to ensure new defaults are picked up during development
      set(mergedSettings);

    } catch (error) {
      console.error('Failed to load settings:', error);
      // Fallback to default settings in case of error
      set(defaultSettings);
    }
  },

  // Force refresh settings from defaults (useful during development)
  refreshSettings: () => {
    if (typeof window === 'undefined') return;
    get().loadSettings();
  },
  
  // Reset settings to defaults
  resetSettings: () => {
    set(defaultSettings); // defaultSettings now includes temperature and maxTokens
    localStorage.setItem('ai-settings', JSON.stringify(defaultSettings));
  },
}));

// Initialize store by loading data on client-side mount
if (typeof window !== 'undefined') {
  useSettingsStore.getState().loadSettings();
  
  // Development hot reload: refresh settings when this module reloads
  if (process.env.NODE_ENV === 'development') {
    // Add a small delay to ensure the store is fully initialized
    setTimeout(() => {
      useSettingsStore.getState().refreshSettings();
    }, 100);
  }
}