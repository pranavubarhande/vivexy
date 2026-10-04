'use client';

import { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@vivexy/ui/card';
import { Button } from '@vivexy/ui/button';
import { Badge } from '@vivexy/ui/badge';
import { Input } from '@vivexy/ui/input';
import { Link2, Link2Off, Search, Plug } from 'lucide-react';
import { toast } from 'sonner';
import {
  useConnections,
  useGenerateConnection,
  useDisconnectConnection,
} from '@/hooks/useConnectors';
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
    <Card className="flex flex-col animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-lg bg-muted" />
            <div className="space-y-1.5">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-3 w-16 rounded bg-muted" />
            </div>
          </div>
          <div className="h-5 w-20 rounded-full bg-muted" />
        </div>
        <div className="space-y-1.5 pt-1">
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-3/4 rounded bg-muted" />
        </div>
      </CardHeader>
      <CardContent className="mt-auto pt-0">
        <div className="h-9 w-full rounded-md bg-muted" />
      </CardContent>
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
        'flex flex-col transition-all duration-200 hover:shadow-md',
        isConnected && 'border-l-4 border-l-green-500'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg flex items-center justify-center bg-muted/50 border border-border p-1.5">
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
              <CardTitle className="text-base leading-tight">
                {connector.name}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {connector.category}
              </span>
            </div>
          </div>
          {isConnected ? (
            <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 shrink-0 hover:bg-green-500/15">
              Connected
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="shrink-0 text-muted-foreground"
            >
              Not Connected
            </Badge>
          )}
        </div>
        <CardDescription className="line-clamp-2 min-h-[36px] text-sm">
          {connector.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto pt-0">
        {isConnected ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/20"
            onClick={onDisconnect}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? (
              <>
                <div className="animate-spin mr-2 h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" />
                Disconnecting...
              </>
            ) : (
              <>
                <Link2Off className="mr-2 h-3.5 w-3.5" />
                Disconnect
              </>
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full"
            onClick={onConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <>
                <div className="animate-spin mr-2 h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" />
                Connecting...
              </>
            ) : (
              <>
                <Link2 className="mr-2 h-3.5 w-3.5" />
                Connect
              </>
            )}
          </Button>
        )}
      </CardContent>
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
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Integrations & Connectors
          </h2>
          <p className="text-muted-foreground mt-1">
            Connect your favorite tools to allow the AI agent to interact with
            them securely.
          </p>
        </div>
        {!isLoading && (
          <div className="shrink-0 flex items-center gap-2 bg-muted/60 rounded-lg px-4 py-2.5 text-sm">
            <Plug className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{connectedCount}</span>
            <span className="text-muted-foreground">
              / {CONNECTORS.length} connected
            </span>
          </div>
        )}
      </div>

      {/* Search + Category filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                activeCategory === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
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
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-medium text-muted-foreground">
            No integrations found
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Try a different search or category
          </p>
        </div>
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
    </div>
  );
}
