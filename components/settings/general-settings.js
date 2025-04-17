'use client';

import { useTheme } from 'next-themes';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/lib/store/settings-store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function GeneralSettings() {
  const { theme, setTheme } = useTheme();
  const { 
    interface: interfaceSettings,
    systemPrompt,
    setInterfaceSetting,
    setSystemPrompt,
  } = useSettingsStore();
  
  return (
    <div className="space-y-6">
      {/* Theme setting */}
      <div className="space-y-2">
        <Label htmlFor="theme">Theme</Label>
        <Select
          id="theme"
          value={theme}
          onValueChange={setTheme}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select theme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Choose the theme for the interface.
        </p>
      </div>
      
      {/* System prompt */}
      <div className="space-y-2">
        <Label htmlFor="system-prompt">System Prompt</Label>
        <Textarea
          id="system-prompt"
          placeholder="Enter a system prompt for the AI..."
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="min-h-24"
        />
        <p className="text-sm text-muted-foreground">
          Set a default system prompt that will be sent with each conversation.
        </p>
      </div>
      
      {/* Interface settings */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Interface Settings</h3>
        
        {/* Show model name */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="show-model">Show model name</Label>
            <p className="text-sm text-muted-foreground">
              Display the model name with each message.
            </p>
          </div>
          <Switch
            id="show-model"
            checked={interfaceSettings.showModelName}
            onCheckedChange={(checked) => setInterfaceSetting('showModelName', checked)}
          />
        </div>
        
        {/* Show timestamps */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="show-timestamps">Show timestamps</Label>
            <p className="text-sm text-muted-foreground">
              Display the timestamp with each message.
            </p>
          </div>
          <Switch
            id="show-timestamps"
            checked={interfaceSettings.showTimestamps}
            onCheckedChange={(checked) => setInterfaceSetting('showTimestamps', checked)}
          />
        </div>
        
        {/* Auto-title conversations */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-title">Auto-title conversations</Label>
            <p className="text-sm text-muted-foreground">
              Automatically set conversation titles based on the first message.
            </p>
          </div>
          <Switch
            id="auto-title"
            checked={interfaceSettings.autoTitleConversations}
            onCheckedChange={(checked) => setInterfaceSetting('autoTitleConversations', checked)}
          />
        </div>
      </div>
    </div>
  );
}