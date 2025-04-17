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
import { cn } from '@/lib/utils';

export default function GeneralSettings() {
  const { theme, setTheme } = useTheme();
  const {
    interface: interfaceSettings,
    systemPrompt,
    setInterfaceSetting,
    setSystemPrompt,
  } = useSettingsStore();

  return (
    <>
      {/* Theme setting */}
      <div className="settings-item">
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
        <p className="settings-item-description">
          Choose the theme for the interface.
        </p>
      </div>

      {/* System prompt */}
      <div className="settings-item">
        <Label htmlFor="system-prompt">System Prompt</Label>
        <Textarea
          id="system-prompt"
          placeholder="You are a helpful assistant."
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="min-h-24"
        />
        <p className="settings-item-description">
          Set a default system prompt that will be sent with each conversation.
        </p>
      </div>

      {/* Interface settings Section */}
      <div className="settings-section">
        <h3 className="settings-section-header">Interface Settings</h3>

        {/* Show model name */}
        <div className="settings-item-row">
          <div className="settings-item-label-desc">
            <Label htmlFor="show-model">Show model name</Label>
            <p className="settings-item-description">
              Display the model name with each message.
            </p>
          </div>
          <div className="settings-item-control">
            <Switch
              id="show-model"
              checked={interfaceSettings.showModelName}
              onCheckedChange={(checked) => setInterfaceSetting('showModelName', checked)}
            />
          </div>
        </div>

        {/* Show timestamps */}
        <div className="settings-item-row">
          <div className="settings-item-label-desc">
            <Label htmlFor="show-timestamps">Show timestamps</Label>
            <p className="settings-item-description">
              Display the timestamp with each message.
            </p>
          </div>
          <div className="settings-item-control">
            <Switch
              id="show-timestamps"
              checked={interfaceSettings.showTimestamps}
              onCheckedChange={(checked) => setInterfaceSetting('showTimestamps', checked)}
            />
          </div>
        </div>

        {/* Auto-title conversations */}
        <div className="settings-item-row">
          <div className="settings-item-label-desc">
            <Label htmlFor="auto-title">Auto-title conversations</Label>
            <p className="settings-item-description">
              Automatically set conversation titles based on the first message.
            </p>
          </div>
          <div className="settings-item-control">
            <Switch
              id="auto-title"
              checked={interfaceSettings.autoTitleConversations}
              onCheckedChange={(checked) => setInterfaceSetting('autoTitleConversations', checked)}
            />
          </div>
        </div>
      </div>
    </>
  );
}