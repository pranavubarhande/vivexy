'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link2, Link2Off } from 'lucide-react';
import { toast } from 'sonner';
import {
  useConnections,
  useGenerateConnection,
  useDisconnectConnection,
} from '@/hooks/useConnectors';

const CONNECTORS = [
  {
    id: 'jira',
    logo: 'https://logos.composio.dev/api/jira',
    name: 'Jira',
    description: 'Atlassian issue and project tracking.',
  },
  {
    id: 'asana',
    logo: 'https://logos.composio.dev/api/asana',
    name: 'Asana',
    description: 'Work management and organization.',
  },
  {
    id: 'trello',
    logo: 'https://logos.composio.dev/api/trello',
    name: 'Trello',
    description: 'Visual team collaboration.',
  },
  {
    id: 'notion',
    logo: 'https://logos.composio.dev/api/notion',
    name: 'Notion',
    description: 'Knowledge base and notes.',
  },
  {
    id: 'productboard',
    logo: 'https://logos.composio.dev/api/productboard',
    name: 'Productboard',
    description: 'Product management system.',
  },
  {
    id: 'gmail',
    logo: 'https://logos.composio.dev/api/gmail',
    name: 'Gmail',
    description: 'Email provider by Google.',
  },
  {
    id: 'outlook',
    logo: 'https://logos.composio.dev/api/outlook',
    name: 'Outlook',
    description: 'Email and calendar by Microsoft.',
  },
  {
    id: 'slack',
    logo: 'https://logos.composio.dev/api/slack',
    name: 'Slack',
    description: 'Team communication and chat.',
  },
  {
    id: 'googlecalendar',
    logo: 'https://logos.composio.dev/api/googlecalendar',
    name: 'Google Calendar',
    description: 'Time-management and scheduling.',
  },
  {
    id: 'googledocs',
    logo: 'https://logos.composio.dev/api/googledocs',
    name: 'Google Docs',
    description: 'Word processor by Google.',
  },
  {
    id: 'googlesheets',
    logo: 'https://logos.composio.dev/api/googlesheets',
    name: 'Google Sheets',
    description: 'Spreadsheet program by Google.',
  },
  {
    id: 'salesforce',
    logo: 'https://logos.composio.dev/api/salesforce',
    name: 'Salesforce',
    description: 'CRM software and applications.',
  },
  {
    id: 'hubspot',
    logo: 'https://logos.composio.dev/api/hubspot',
    name: 'HubSpot',
    description: 'Inbound marketing and sales software.',
  },
];

export default function ConnectorsPage() {
  const { data: activeConnectionsArray, isLoading } = useConnections();
  const generateConnection = useGenerateConnection();
  const disconnectConnection = useDisconnectConnection();

  // Map the simple array back to the quick-lookup hash map
  const activeConnections = (activeConnectionsArray || []).reduce(
    (acc: Record<string, boolean>, app: string) => {
      acc[app] = true;
      return acc;
    },
    {}
  );

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading integrations...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Integrations & Connectors
        </h2>
        <p className="text-muted-foreground">
          Connect your favorite tools to allow AI agent to interact with them
          securely.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {CONNECTORS.map((connector) => {
          const isConnected = activeConnections[connector.id];
          return (
            <Card key={connector.id} className="flex flex-col">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-md flex items-center justify-center bg-transparent border border-gray-100 p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={connector.logo}
                        alt={connector.name}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <CardTitle className="text-lg">{connector.name}</CardTitle>
                  </div>
                  {isConnected ? (
                    <Badge
                      variant="default"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not Connected</Badge>
                  )}
                </div>
                <CardDescription className="line-clamp-2 min-h-[40px]">
                  {connector.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto pt-0">
                {isConnected ? (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => handleDisconnect(connector.id)}
                    disabled={
                      disconnectConnection.isPending &&
                      disconnectConnection.variables === connector.id
                    }
                  >
                    {disconnectConnection.isPending &&
                    disconnectConnection.variables === connector.id ? (
                      <span className="flex items-center">
                        <div className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                        Disconnecting...
                      </span>
                    ) : (
                      <>
                        <Link2Off className="mr-2 h-4 w-4" />
                        Disconnect
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    className="w-full"
                    onClick={() => handleConnect(connector.id)}
                    disabled={
                      generateConnection.isPending &&
                      generateConnection.variables === connector.id
                    }
                  >
                    {generateConnection.isPending &&
                    generateConnection.variables === connector.id ? (
                      <span className="flex items-center">
                        <div className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                        Connecting...
                      </span>
                    ) : (
                      <>
                        <Link2 className="mr-2 h-4 w-4" />
                        Connect
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
