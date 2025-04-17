'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import GeneralSettings from './general-settings';
import ModelSettings from './model-settings';
import DataSettings from './data-settings';
import { cn } from '@/lib/utils';

export function UserSettings({ open, onClose }) {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn("max-w-2xl", "settings-dialog-content")}>
        <DialogHeader className="mb-4">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <Tabs
          defaultValue="general"
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="settings-tabs-list">
            <TabsTrigger value="general" className="settings-tabs-trigger">General</TabsTrigger>
            <TabsTrigger value="models" className="settings-tabs-trigger">Models</TabsTrigger>
            <TabsTrigger value="data" className="settings-tabs-trigger">Data Management</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="settings-tabs-content">
            <GeneralSettings />
          </TabsContent>

          <TabsContent value="models" className="settings-tabs-content">
            <ModelSettings />
          </TabsContent>

          <TabsContent value="data" className="settings-tabs-content">
            <DataSettings onClose={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}