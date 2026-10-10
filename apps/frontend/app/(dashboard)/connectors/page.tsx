'use client';

import { useState, useMemo } from 'react';
import { Card } from '@vivexy/ui/card';
import { EmptyState, PageContainer, PageHeader } from '@vivexy/ui/page-header';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import { Link2, Link2Off, Search, Plug } from 'lucide-react';
import { toast } from 'sonner';
import {
  useConnections,
  useGenerateConnection,
  useDisconnectConnection,
} from '@vivexy/core/hooks/useConnectors';
import { cn } from '@vivexy/ui/utils';

type Category =
  | 'All'
  | 'Project Management'
  | 'Communication'
  | 'Productivity'
  | 'CRM';

const CATEGORIES: Category[] = [
  'All',
  'Project Management',
  'Communication',
  'Productivity',
  'CRM',
];

const CONNECTORS: {
  id: string;
  logo: string;
  name: string;
  description: string;
  category: Category;
}[] = [
  {
    id: 'jira',
    logo: 'https://logos.composio.dev/api/jira',
    name: 'Jira',
    description: 'Atlassian issue and project tracking.',
    category: 'Project Management',
  },
  {
    id: 'asana',
    logo: 'https://logos.composio.dev/api/asana',
    name: 'Asana',
    description: 'Work management and organization.',
    category: 'Project Management',
  },
  {
    id: 'trello',
    logo: 'https://logos.composio.dev/api/trello',
    name: 'Trello',
    description: 'Visual team collaboration.',
    category: 'Project Management',
  },
  {
    id: 'notion',
    logo: 'https://logos.composio.dev/api/notion',
    name: 'Notion',
    description: 'Knowledge base and notes.',
    category: 'Project Management',
  },
  {
    id: 'productboard',
    logo: 'https://logos.composio.dev/api/productboard',
    name: 'Productboard',
    description: 'Product management system.',
    category: 'Project Management',
  },
  {
    id: 'slack',
    logo: 'https://logos.composio.dev/api/slack',
    name: 'Slack',
    description: 'Team communication and chat.',
    category: 'Communication',
  },
  {
    id: 'gmail',
    logo: 'https://logos.composio.dev/api/gmail',
    name: 'Gmail',
    description: 'Email provider by Google.',
    category: 'Communication',
  },
  {
    id: 'outlook',
    logo: 'https://logos.composio.dev/api/outlook',
    name: 'Outlook',
    description: 'Email and calendar by Microsoft.',
    category: 'Communication',
  },
  {
    id: 'googlecalendar',
    logo: 'https://logos.composio.dev/api/googlecalendar',
    name: 'Google Calendar',
    description: 'Time-management and scheduling.',
    category: 'Productivity',
  },
  {
    id: 'googledocs',
    logo: 'https://logos.composio.dev/api/googledocs',
    name: 'Google Docs',
    description: 'Word processor by Google.',
    category: 'Productivity',
  },
  {
    id: 'googlesheets',
    logo: 'https://logos.composio.dev/api/googlesheets',
    name: 'Google Sheets',
    description: 'Spreadsheet program by Google.',
    category: 'Productivity',
  },
  {
    id: 'salesforce',
    logo: 'https://logos.composio.dev/api/salesforce',
    name: 'Salesforce',
    description: 'CRM software and applications.',
    category: 'CRM',
  },
  {
    id: 'hubspot',
    logo: 'https://logos.composio.dev/api/hubspot',
    name: 'HubSpot',
    description: 'Inbound marketing and sales software.',
    category: 'CRM',
  },
];

function ConnectorSkeleton() {
  return (
    <Card className="flex flex-col gap-4 p-5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-muted" />
        <div className="space-y-1.5">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-3 w-16 rounded bg-muted" />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-3/4 rounded bg-muted" />
      </div>
      <div className="h-9 w-full rounded-full bg-muted" />
    </Card>
  );
}

interface ConnectorCardProps {
  connector: (typeof CONNECTORS)[number];
  isConnected: boolean;
  isConnecting: boolean;
  isDisconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

function Spinner() {
  return (
    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

function ConnectorCard({
  connector,
  isConnected,
  isConnecting,
  isDisconnecting,
  onConnect,
  onDisconnect,
}: ConnectorCardProps) {
  return (
    <Card
      className={cn(
        'group flex flex-col gap-4 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        isConnected &&
          'border-primary-500/60 bg-[linear-gradient(180deg,var(--color-primary-50),var(--color-card)_55%)]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background p-2 shadow-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={connector.logo}
              alt={connector.name}
              className="h-full w-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-semibold leading-tight">
              {connector.name}
            </h3>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {connector.category}
            </span>
          </div>
        </div>
        <span
          className={cn(
            'mt-1 inline-flex shrink-0 items-center gap-1.5 text-xs font-medium',
            isConnected ? 'text-ink' : 'text-muted-foreground/70'
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              isConnected
                ? 'bg-lime ring-2 ring-lime/30'
                : 'bg-muted-foreground/30'
            )}
          />
          {isConnected ? 'Connected' : 'Off'}
        </span>
      </div>
      <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
        {connector.description}
      </p>
      <div className="mt-auto">
        {isConnected ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/5"
            onClick={onDisconnect}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? <Spinner /> : <Link2Off />}
            {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full group-hover:border-foreground/30"
            onClick={onConnect}
            disabled={isConnecting}
          >
            {isConnecting ? <Spinner /> : <Link2 />}
            {isConnecting ? 'Connecting…' : 'Connect'}
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function ConnectorsPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('All');

  const { data: activeConnectionsArray, isLoading } = useConnections();
  const generateConnection = useGenerateConnection();
  const disconnectConnection = useDisconnectConnection();

  const activeConnections = (activeConnectionsArray || []).reduce(
    (acc: Record<string, boolean>, app: string) => {
      acc[app] = true;
      return acc;
    },
    {}
  );

  const connectedCount = CONNECTORS.filter(
    (c) => activeConnections[c.id]
  ).length;

  const filteredConnectors = useMemo(() => {
    const q = search.toLowerCase();
    return CONNECTORS.filter((c) => {
      const matchesCategory =
        activeCategory === 'All' || c.category === activeCategory;
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory]);

  const handleConnect = async (connectorId: string) => {
    try {
      const data = await generateConnection.mutateAsync(connectorId);
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error('No URL returned');
      }
    } catch (error) {
      console.error(error);
      toast.error(`Failed to connect to ${connectorId}.`);
    }
  };

  const handleDisconnect = async (connectorId: string) => {
    try {
      await disconnectConnection.mutateAsync(connectorId);
      toast.success(`Successfully disconnected from ${connectorId}.`);
    } catch (error) {
      console.error(error);
      toast.error(`Failed to disconnect from ${connectorId}.`);
    }
  };

  return (
    <PageContainer size="wide">
      <PageHeader
        eyebrow="Integrations"
        title="Connect your tools"
        description="Give your agents secure access to the apps your team already uses. Connections are scoped to your account and can be revoked any time."
        actions={
          !isLoading && (
            <div className="flex items-center gap-3 rounded-full border border-border bg-background py-1.5 pl-1.5 pr-4 text-sm shadow-xs">
              <span className="flex size-7 items-center justify-center rounded-full bg-lime text-lime-foreground">
                <Plug className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="font-semibold">{connectedCount}</span>
                <span className="text-muted-foreground">
                  {' '}
                  of {CONNECTORS.length} connected
                </span>
              </span>
            </div>
          )
        }
      />

      {/* Search + Category filters */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search integrations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-full pl-10"
          />
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                activeCategory === cat
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ConnectorSkeleton key={i} />
          ))}
        </div>
      ) : filteredConnectors.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="No integrations found"
          description="Try a different search term or category."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredConnectors.map((connector) => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              isConnected={!!activeConnections[connector.id]}
              isConnecting={
                generateConnection.isPending &&
                generateConnection.variables === connector.id
              }
              isDisconnecting={
                disconnectConnection.isPending &&
                disconnectConnection.variables === connector.id
              }
              onConnect={() => handleConnect(connector.id)}
              onDisconnect={() => handleDisconnect(connector.id)}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
