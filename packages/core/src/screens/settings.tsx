'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@vivexy/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@vivexy/ui/tabs';
import { PageContainer, PageHeader } from '@vivexy/ui/page-header';
import { cn } from '@vivexy/ui/utils';
import {
  User,
  KeyRound,
  Bell,
  KeySquare,
  Link2,
  Puzzle,
  Palette,
  TriangleAlert,
} from 'lucide-react';
import { ProfileSettings } from '@vivexy/core/settings/profile-settings';
import { PasswordSettings } from '@vivexy/core/settings/password-settings';
import { NotificationSettings } from '@vivexy/core/settings/notification-settings';
import { DangerZone } from '@vivexy/core/settings/danger-zone';
import { McpSettings } from '@vivexy/core/settings/mcp-settings';
import { SkillsSettings } from '@vivexy/core/settings/skills-settings';
import { ApiKeysSettings } from '@vivexy/core/settings/api-keys-settings';
import { ThemeSettings } from '@vivexy/core/settings/theme-settings';
import { GithubSettings } from '@vivexy/core/settings/github-settings';
import { useFeatures } from '@vivexy/core/hooks/useFeatures';
import { FEATURES, FeatureName } from '@vivexy/core/constants/features';

const SECTIONS: {
  value: string;
  label: string;
  icon: typeof User;
  feature?: FeatureName;
}[] = [
  { value: 'profile', label: 'Profile', icon: User },
  { value: 'password', label: 'Password', icon: KeyRound },
  { value: 'notifications', label: 'Notifications', icon: Bell },
  {
    value: 'api-keys',
    label: 'API keys',
    icon: KeySquare,
    feature: FEATURES.apiKeys,
  },
  {
    value: 'connections',
    label: 'Connections',
    icon: Link2,
    feature: FEATURES.github,
  },
  { value: 'extensions', label: 'Extensions', icon: Puzzle },
  { value: 'appearance', label: 'Appearance', icon: Palette },
  { value: 'danger', label: 'Danger zone', icon: TriangleAlert },
];

const SettingsContent = () => {
  const [isDesktop] = useState(
    () => typeof window !== 'undefined' && !!window.electronAPI
  );
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isEnabled } = useFeatures();
  const sections = SECTIONS.filter(
    (section) => !section.feature || isEnabled(section.feature)
  );
  const requestedTab = searchParams.get('tab') ?? 'profile';
  const tab = sections.some((section) => section.value === requestedTab)
    ? requestedTab
    : 'profile';

  const setTab = (value: string) =>
    router.replace(`?tab=${value}`, { scroll: false });

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Manage your profile, security, model keys and how your workspace looks."
      />
      <Tabs
        value={tab}
        onValueChange={setTab}
        orientation="vertical"
        className="flex flex-col gap-8 md:flex-row"
      >
        <TabsList className="no-scrollbar h-auto w-full shrink-0 justify-start gap-1 overflow-x-auto rounded-2xl bg-transparent p-0 md:sticky md:top-6 md:w-52 md:flex-col md:items-stretch md:self-start">
          {sections.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                'justify-start gap-2.5 rounded-xl px-3 py-2 text-muted-foreground data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_1px_var(--color-border)]',
                value === 'danger' &&
                  'md:mt-4 data-[state=active]:text-destructive hover:text-destructive'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-w-0 flex-1 [&>[role=tabpanel]]:mt-0">
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

          <TabsContent value="api-keys" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>
                  Bring your own API keys for any supported provider. Your keys
                  are encrypted and take priority over server defaults.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ApiKeysSettings />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="connections" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Connected Accounts</CardTitle>
                <CardDescription>
                  Link external services so the agent can interact with your
                  repositories, workspaces, and data sources.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GithubSettings />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="extensions" className="space-y-4">
            <Tabs
              defaultValue={isDesktop ? 'mcp' : 'skills'}
              className="space-y-4"
            >
              <TabsList>
                <TabsTrigger value="mcp">MCP Servers</TabsTrigger>
                <TabsTrigger value="skills">Skills</TabsTrigger>
              </TabsList>

              <TabsContent value="mcp">
                <Card>
                  <CardHeader>
                    <CardTitle>MCP Servers</CardTitle>
                    <CardDescription>
                      Model Context Protocol servers extend the agent with
                      external tools and data sources. HTTP/SSE servers work on
                      web; stdio servers require the desktop app.
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
                      in the chat. Each skill injects its instructions as
                      context when invoked.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SkillsSettings />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="appearance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>
                  Customize the look and feel of your workspace. Theme changes
                  apply instantly across all pages including the sidebar,
                  navigation, and chat interface.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ThemeSettings />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="danger" className="space-y-4">
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-destructive">Danger zone</CardTitle>
                <CardDescription>
                  Irreversible and destructive actions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DangerZone />
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </PageContainer>
  );
};

const SettingsPage = () => (
  <Suspense>
    <SettingsContent />
  </Suspense>
);

export default SettingsPage;
