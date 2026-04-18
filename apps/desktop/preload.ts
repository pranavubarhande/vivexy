/**
 * Preload Script
 *
 * Exposes a secure `window.electronAPI` bridge via contextBridge.
 * The renderer (Next.js) uses this to execute tools and manage workspaces.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    /** Runtime flag so the renderer can detect Electron */
    isElectron: true as const,

    /**
     * Execute a tool in the Electron main process.
     * @param toolName  Name of the tool (e.g. "create_artifact")
     * @param toolInput Tool arguments as a plain object
     * @returns JSON string with the tool result
     */
    executeTool: (
        toolName: string,
        toolInput: Record<string, unknown>
    ): Promise<string> => {
        return ipcRenderer.invoke('execute-tool', toolName, toolInput);
    },

    /** Get the current workspace folder path (null if none selected) */
    getWorkspacePath: (): Promise<string | null> => {
        return ipcRenderer.invoke('get-workspace-path');
    },

    /** Get list of recently used workspaces */
    getRecentWorkspaces: (): Promise<string[]> => {
        return ipcRenderer.invoke('get-recent-workspaces');
    },

    /** Open native folder picker to select a workspace */
    selectWorkspaceFolder: (): Promise<string | null> => {
        return ipcRenderer.invoke('select-workspace-folder');
    },

    /** Set workspace directly from a path (e.g. recent workspace click) */
    setWorkspace: (
        workspacePath: string
    ): Promise<{ success: boolean; error?: string }> => {
        return ipcRenderer.invoke('set-workspace', workspacePath);
    },

    /** Get workspace info (name, path, file/folder counts) */
    getWorkspaceInfo: (): Promise<Record<string, unknown> | null> => {
        return ipcRenderer.invoke('get-workspace-info');
    },

    /** Load saved artifacts for a chat from local filesystem */
    listArtifacts: (chatId: string): Promise<string> => {
        return ipcRenderer.invoke('list-artifacts', chatId);
    },

    /** Save a file to the local workspace */
    saveLocalFile: (chatId: string, filename: string, buffer: ArrayBuffer) =>
        ipcRenderer.invoke('save-local-file', chatId, filename, buffer),

    /** List files in workspace root */
    listWorkspaceFiles: (): Promise<string> => {
        return ipcRenderer.invoke('list-workspace-files');
    },

    /** Get all MCP server configurations */
    getMcpConfig: (): Promise<Record<string, unknown>> => {
        return ipcRenderer.invoke('get-mcp-config');
    },

    /** Save MCP server configurations */
    saveMcpConfig: (servers: Record<string, unknown>): Promise<void> => {
        return ipcRenderer.invoke('save-mcp-config', servers);
    },

    /** Get all skills */
    getSkills: (): Promise<unknown[]> => {
        return ipcRenderer.invoke('get-skills');
    },

    /** Save (upsert) a single skill */
    saveSkill: (skill: unknown): Promise<void> => {
        return ipcRenderer.invoke('save-skill', skill);
    },

    /** Delete a skill by id */
    deleteSkill: (skillId: string): Promise<void> => {
        return ipcRenderer.invoke('delete-skill', skillId);
    },

    /** Read a single file from a skill folder */
    readSkillFile: (
        skillName: string,
        filename: string
    ): Promise<string | null> => {
        return ipcRenderer.invoke('read-skill-file', skillName, filename);
    },

    /** Write a single file inside a skill folder */
    writeSkillFile: (
        skillName: string,
        filename: string,
        content: string
    ): Promise<void> => {
        return ipcRenderer.invoke(
            'write-skill-file',
            skillName,
            filename,
            content
        );
    },

    /** Delete a supporting file from a skill folder */
    deleteSkillFile: (skillName: string, filename: string): Promise<void> => {
        return ipcRenderer.invoke('delete-skill-file', skillName, filename);
    },

    /** Get extensions directory paths */
    getExtensionsPaths: (): Promise<{
        skillsDir: string;
        configDir: string;
    }> => {
        return ipcRenderer.invoke('get-extensions-paths');
    },

    /** Start (or restart) all enabled MCP servers from saved config */
    startMcpServers: (): Promise<{ success: boolean; error?: string }> => {
        return ipcRenderer.invoke('start-mcp-servers');
    },

    /** Get tool definitions from all currently running MCP servers */
    getMcpTools: (): Promise<unknown[]> => {
        return ipcRenderer.invoke('get-mcp-tools');
    },

    /** Execute an MCP tool call on the specified server */
    callMcpTool: (
        serverName: string,
        toolName: string,
        toolInput: Record<string, unknown>
    ): Promise<string> => {
        return ipcRenderer.invoke(
            'call-mcp-tool',
            serverName,
            toolName,
            toolInput
        );
    },
});
