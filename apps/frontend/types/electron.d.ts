/**
 * Type declarations for the Electron preload API.
 *
 * When running inside Electron, window.electronAPI is available.
 * In a regular browser, it is undefined — all tools run server-side.
 *
 * NOTE: Use `import { platform } from '@/lib/platform'` for detection
 * instead of checking window.electronAPI directly.
 */

export type SkillPlatform = 'desktop' | 'web' | 'both';
export type McpTransport = 'stdio' | 'http';

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** For HTTP/SSE MCP servers — used instead of command/args */
  url?: string;
  transport: McpTransport;
  enabled: boolean;
  description?: string;
}

/**
 * A skill is stored as a folder on disk: ~/.portfolio-helper-skills/{name}/
 *   SKILL.md  — main entry file (instructions + frontmatter)
 *   *.md      — optional supporting reference files
 */
export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  /** Content of SKILL.md — the main instruction file */
  content: string;
  /** Additional files in the skill folder: { filename → content } */
  files?: Record<string, string>;
  enabled: boolean;
  /**
   * Where this skill is available:
   *   desktop — local disk only, never synced to backend
   *   web     — backend DB only, no local copy
   *   both    — synced to backend and cached locally (default)
   */
  platform: SkillPlatform;
  /** Absolute path to the skill folder on disk (desktop only) */
  folderPath?: string;
}

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

  /** Get all MCP server configurations */
  getMcpConfig: () => Promise<Record<string, McpServerConfig>>;

  /** Save MCP server configurations */
  saveMcpConfig: (servers: Record<string, McpServerConfig>) => Promise<void>;

  /** Get all skills */
  getSkills: () => Promise<SkillConfig[]>;

  /** Save (upsert) a single skill */
  saveSkill: (skill: SkillConfig) => Promise<void>;

  /** Delete a skill by id */
  deleteSkill: (skillId: string) => Promise<void>;

  /** Read a single file from a skill folder (returns content or null) */
  readSkillFile: (
    skillName: string,
    filename: string
  ) => Promise<string | null>;

  /** Write a single file inside a skill folder */
  writeSkillFile: (
    skillName: string,
    filename: string,
    content: string
  ) => Promise<void>;

  /** Delete a supporting file from a skill folder (cannot delete SKILL.md) */
  deleteSkillFile: (skillName: string, filename: string) => Promise<void>;

  /** Get extensions directory paths */
  getExtensionsPaths: () => Promise<{ skillsDir: string; configDir: string }>;

  /** Start (or restart) all enabled MCP servers from saved config */
  startMcpServers: () => Promise<{ success: boolean; error?: string }>;

  /** Get tool definitions from all currently running MCP servers */
  getMcpTools: () => Promise<McpToolDefinition[]>;

  /** Execute an MCP tool call on the specified server */
  callMcpTool: (
    serverName: string,
    toolName: string,
    toolInput: Record<string, unknown>
  ) => Promise<string>;
}

export interface McpToolDefinition {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
