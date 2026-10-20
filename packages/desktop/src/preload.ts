/**
 * Preload API: builds the `window.electronAPI` bridge the renderer uses to
 * execute tools and manage workspaces. Imports nothing but electron, so it
 * can be bundled into a sandboxed preload script.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

export const createElectronAPI = () => ({
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
    return ipcRenderer.invoke('write-skill-file', skillName, filename, content);
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
    return ipcRenderer.invoke('call-mcp-tool', serverName, toolName, toolInput);
  },

  /** Detect whether the current workspace is a git repo and return branch/remote info */
  detectGit: (): Promise<{
    isGit: boolean;
    branch?: string;
    remote?: string;
    repoName?: string;
    workspacePath?: string;
    repos?: Array<{
      isGit: boolean;
      branch?: string;
      remote?: string;
      repoName?: string;
      workspacePath?: string;
    }>;
  }> => {
    return ipcRenderer.invoke('git-detect');
  },

  /** Run a safe read-only git command in the workspace (status/log/diff/branch) */
  gitExec: (args: string[]): Promise<string> => {
    return ipcRenderer.invoke('git-exec', args);
  },

  /** Run a safe git command in a specific workspace path */
  gitExecAt: (workspacePath: string, args: string[]): Promise<string> => {
    return ipcRenderer.invoke('git-exec-at', workspacePath, args);
  },

  /** Read a file within a workspace path */
  readWorkspaceFile: (
    workspacePath: string,
    filePath: string
  ): Promise<string> => {
    return ipcRenderer.invoke('read-workspace-file', workspacePath, filePath);
  },

  /** List files/folders in a directory within a workspace */
  listWorkspaceDir: (
    workspacePath: string,
    dirPath: string
  ): Promise<{
    items?: Array<{ name: string; type: 'file' | 'dir' }>;
    error?: string;
  }> => {
    return ipcRenderer.invoke('list-workspace-dir', workspacePath, dirPath);
  },

  /** Write a file within a workspace path */
  writeWorkspaceFile: (
    workspacePath: string,
    filePath: string,
    content: string
  ): Promise<{ success?: boolean; error?: string }> => {
    return ipcRenderer.invoke(
      'write-workspace-file',
      workspacePath,
      filePath,
      content
    );
  },

  /** Subscribe to workspace change events from the main process */
  onWorkspaceChanged: (callback: (newPath: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, newPath: string) =>
      callback(newPath);
    ipcRenderer.on('workspace-changed', handler);
    return () => ipcRenderer.removeListener('workspace-changed', handler);
  },

  /** Capture the current git state as a snapshot object (stash SHA or HEAD SHA). */
  snapshotGit: (workspacePath?: string): Promise<string> => {
    return ipcRenderer.invoke('git-snapshot', workspacePath);
  },

  /** Restore workspace files to a previously captured git snapshot SHA. */
  restoreGitSnapshot: (
    workspacePath: string,
    sha: string
  ): Promise<{ success?: boolean; error?: string }> => {
    return ipcRenderer.invoke('git-restore-snapshot', workspacePath, sha);
  },
});

export type ElectronAPI = ReturnType<typeof createElectronAPI>;

/**
 * Expose `window.electronAPI` (the full built-in contract) plus any extra
 * product-specific members. Built-in members cannot be overridden.
 */
export const exposeElectronAPI = (
  extra: Record<string, unknown> = {}
): void => {
  contextBridge.exposeInMainWorld('electronAPI', {
    ...extra,
    ...createElectronAPI(),
  });
};
