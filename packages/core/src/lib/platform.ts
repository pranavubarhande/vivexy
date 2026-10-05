/**
 * Platform Detection & Workspace Management
 *
 * Single source of truth for determining whether the app is running in
 * Electron (desktop) or a regular browser (web), and for interacting
 * with workspace-level operations.
 */

const checkIsDesktop = (): boolean => {
  if (typeof window === 'undefined') return false;
  return !!window.electronAPI;
};

export interface WorkspaceInfo {
  name: string;
  path: string;
  fileCount: number;
  folderCount: number;
}

export const platform = {
  get isDesktop(): boolean {
    return checkIsDesktop();
  },

  get isWeb(): boolean {
    return !checkIsDesktop();
  },

  /**
   * Execute a tool via Electron IPC. Throws if not in Electron.
   */
  async executeTool(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<string> {
    if (!window.electronAPI) {
      throw new Error('executeTool called outside of Electron');
    }
    return window.electronAPI.executeTool(toolName, toolInput);
  },

  /** Get the workspace path from Electron. Returns null on web or if none selected. */
  async getWorkspacePath(): Promise<string | null> {
    if (!window.electronAPI?.getWorkspacePath) return null;
    return window.electronAPI.getWorkspacePath();
  },

  /** Get recently used workspaces. Returns [] on web. */
  async getRecentWorkspaces(): Promise<string[]> {
    if (!window.electronAPI?.getRecentWorkspaces) return [];
    return window.electronAPI.getRecentWorkspaces();
  },

  /** Open folder picker in Electron. Returns null on web. */
  async selectWorkspaceFolder(): Promise<string | null> {
    if (!window.electronAPI?.selectWorkspaceFolder) return null;
    return window.electronAPI.selectWorkspaceFolder();
  },

  /** Set workspace directly (e.g. from recent list). Returns success. */
  async setWorkspace(
    workspacePath: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!window.electronAPI?.setWorkspace) {
      return { success: false, error: 'Not in desktop mode' };
    }
    return window.electronAPI.setWorkspace(workspacePath);
  },

  /** Get workspace info (name, path, file/folder counts). Returns null if no workspace. */
  async getWorkspaceInfo(): Promise<WorkspaceInfo | null> {
    if (!window.electronAPI?.getWorkspaceInfo) return null;
    return (await window.electronAPI.getWorkspaceInfo()) as WorkspaceInfo | null;
  },

  /** Load artifacts for a chat from local filesystem. Returns [] on web. */
  async listArtifacts(chatId: string): Promise<unknown[]> {
    if (!window.electronAPI?.listArtifacts) return [];
    try {
      const json = await window.electronAPI.listArtifacts(chatId);
      return JSON.parse(json);
    } catch {
      return [];
    }
  },

  /** Save an uploaded file to the local workspace (Electron only) */
  async saveLocalFile(
    chatId: string,
    filename: string,
    buffer: ArrayBuffer
  ): Promise<string> {
    if (platform.isDesktop && window.electronAPI) {
      return await window.electronAPI.saveLocalFile(chatId, filename, buffer);
    }
    return JSON.stringify({ success: false, error: 'Not in desktop mode' });
  },

  /** List files in workspace root. Returns [] on web. */
  async listWorkspaceFiles(): Promise<
    Array<{ name: string; type: string; path: string }>
  > {
    if (!window.electronAPI?.listWorkspaceFiles) return [];
    try {
      const json = await window.electronAPI.listWorkspaceFiles();
      return JSON.parse(json);
    } catch {
      return [];
    }
  },
};
