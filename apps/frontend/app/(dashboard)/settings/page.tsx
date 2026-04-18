'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { PasswordSettings } from '@/components/settings/password-settings';
import { NotificationSettings } from '@/components/settings/notification-settings';
import { DangerZone } from '@/components/settings/danger-zone';
import { McpSettings } from '@/components/settings/mcp-settings';
import { SkillsSettings } from '@/components/settings/skills-settings';

const SettingsContent = () => {
  const [isDesktop] = useState(
    () => typeof window !== 'undefined' && !!window.electronAPI
  );
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get('tab') ?? 'profile';

  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="extensions">Extensions</TabsTrigger>
        <TabsTrigger value="danger">Danger Zone</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your personal information and email address.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileSettings />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="password" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Update your password to keep your account secure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordSettings />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="notifications" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Notification Preferences</CardTitle>
            <CardDescription>
              Configure how you receive notifications.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NotificationSettings />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="extensions" className="space-y-4">
        <Tabs defaultValue={isDesktop ? 'mcp' : 'skills'} className="space-y-4">
          <TabsList>
            <TabsTrigger value="mcp">MCP Servers</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
          </TabsList>

          <TabsContent value="mcp">
            <Card>
              <CardHeader>
                <CardTitle>MCP Servers</CardTitle>
                <CardDescription>
                  Model Context Protocol servers extend the agent with external
                  tools and data sources. HTTP/SSE servers work on web; stdio
                  servers require the desktop app.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <McpSettings />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="skills">
            <Card>
              <CardHeader>
                <CardTitle>Skills</CardTitle>
                <CardDescription>
                  Skills are reusable instruction sets accessible via{' '}
                  <kbd className="px-1.5 py-0.5 bg-muted border rounded text-xs">
                    /command
                  </kbd>{' '}
                  in the chat. Each skill injects its instructions as context
                  when invoked.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SkillsSettings />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="danger" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DangerZone />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

const SettingsPage = () => (
  <Suspense>
    <SettingsContent />
  </Suspense>
);

export default SettingsPage;
