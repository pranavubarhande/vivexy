/**
 * Type declarations for the Electron preload API.
 *
 * When running inside Electron, window.electronAPI is available.
 * In a regular browser, it is undefined — all tools run server-side.
 *
 * NOTE: Use `import { platform } from '@/lib/platform'` for detection
 * instead of checking window.electronAPI directly.
 */

interface ElectronAPI {
  /** Execute a tool in the Electron main process via IPC */
  executeTool: (
    toolName: string,
    toolInput: Record<string, unknown>
  ) => Promise<string>;

  /** Runtime flag — always true when running inside Electron */
  isElectron: true;

  /** Get the current workspace folder path (null if none selected) */
  getWorkspacePath: () => Promise<string | null>;

  /** Get list of recently used workspaces */
  getRecentWorkspaces: () => Promise<string[]>;

  /** Open native folder picker to select workspace */
  selectWorkspaceFolder: () => Promise<string | null>;

  /** Set workspace directly from a path */
  setWorkspace: (
    workspacePath: string
  ) => Promise<{ success: boolean; error?: string }>;

  /** Get workspace info (name, path, file/folder counts) */
  getWorkspaceInfo: () => Promise<Record<string, unknown> | null>;

  /** Load artifacts for a chat from local filesystem */
  listArtifacts: (chatId: string) => Promise<string>;

  /** Save a file to the local workspace */
  saveLocalFile: (
    chatId: string,
    filename: string,
    buffer: ArrayBuffer
  ) => Promise<string>;

  /** List files in the workspace root */
  listWorkspaceFiles: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
