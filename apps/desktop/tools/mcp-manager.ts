/**
 * MCP Manager — Desktop Process Manager for Model Context Protocol Servers
 *
 * Spawns enabled MCP servers as child processes using stdio transport,
 * keeps them alive for the app lifetime, and proxies tool calls to them.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { McpServerConfig } from './paths';

export interface McpToolDefinition {
    serverName: string;
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

interface ActiveServer {
    client: Client;
    transport: StdioClientTransport;
    tools: McpToolDefinition[];
}

const activeServers: Map<string, ActiveServer> = new Map();

/** Start all enabled MCP servers from the provided config map */
export const startMcpServers = async (
    servers: Record<string, McpServerConfig>
): Promise<void> => {
    // Stop any servers no longer configured or disabled
    for (const [name, active] of activeServers.entries()) {
        const cfg = servers[name];
        if (!cfg || !cfg.enabled) {
            await stopServer(name, active);
        }
    }

    // Start newly enabled servers
    for (const [name, cfg] of Object.entries(servers)) {
        if (!cfg.enabled) continue;
        if (activeServers.has(name)) continue; // already running

        try {
            await startServer(name, cfg);
        } catch (err) {
            console.error(`[MCP] Failed to start server "${name}":`, err);
        }
    }
};

const startServer = async (
    name: string,
    cfg: McpServerConfig
): Promise<void> => {
    const env: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(process.env).filter(([, v]) => v !== undefined) as [
                string,
                string,
            ][]
        ),
        ...(cfg.env ?? {}),
    };

    const transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
        env,
    });

    const client = new Client(
        { name: 'portfolio-helper-desktop', version: '1.0.0' },
        { capabilities: {} }
    );

    await client.connect(transport);

    const response = await client.listTools();
    const tools: McpToolDefinition[] = (response.tools ?? []).map(
        (t: Tool) => ({
            serverName: name,
            name: t.name,
            description: t.description ?? '',
            inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
        })
    );

    activeServers.set(name, { client, transport, tools });
    console.log(
        `[MCP] Started "${name}" with ${tools.length} tool(s): ${tools.map((t) => t.name).join(', ')}`
    );
};

const stopServer = async (
    name: string,
    active: ActiveServer
): Promise<void> => {
    try {
        await active.client.close();
    } catch {
        /* best-effort */
    }
    activeServers.delete(name);
    console.log(`[MCP] Stopped "${name}"`);
};

/** Returns all tool definitions across all running servers */
export const getAvailableMcpTools = (): McpToolDefinition[] => {
    const tools: McpToolDefinition[] = [];
    for (const { tools: serverTools } of activeServers.values()) {
        tools.push(...serverTools);
    }
    return tools;
};

/**
 * Call a specific MCP tool on its server.
 * Returns the result as a JSON string.
 */
export const callMcpTool = async (
    serverName: string,
    toolName: string,
    toolInput: Record<string, unknown>
): Promise<string> => {
    const active = activeServers.get(serverName);
    if (!active) {
        return JSON.stringify({
            error: `MCP server "${serverName}" is not running`,
        });
    }

    try {
        const result = await active.client.callTool({
            name: toolName,
            arguments: toolInput,
        });

        const content = result.content ?? [];
        if (Array.isArray(content) && content.length > 0) {
            const firstText = content.find(
                (c: { type: string }) => c.type === 'text'
            );
            if (firstText && 'text' in firstText) {
                return (firstText as { text: string }).text;
            }
        }
        return JSON.stringify(result);
    } catch (err) {
        return JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
        });
    }
};

/** Shut down all running MCP servers (call on app quit) */
export const stopAllMcpServers = async (): Promise<void> => {
    for (const [name, active] of activeServers.entries()) {
        await stopServer(name, active);
    }
};
