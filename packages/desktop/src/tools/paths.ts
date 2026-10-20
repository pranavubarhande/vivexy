/**
 * Path helpers for the Electron app's local data storage.
 *
 * Every on-disk name derives from the data namespace (default "vivexy"):
 *   ~/.{namespace}-config.json      – workspace root, recents, MCP + skill metadata
 *   ~/.{namespace}-skills/          – installed skills
 *   ~/.{namespace}-chat-index.json  – chatId → workspace root
 *   {workspace}/.{namespace}/       – artifacts, files and manifests per chat
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const DEFAULT_DATA_NAMESPACE = 'vivexy';

let dataNamespace = DEFAULT_DATA_NAMESPACE;
let cachedWorkspaceRoot: string | null = null;

/** Set the namespace used for every on-disk name. Called by createDesktopApp. */
export const configureDataNamespace = (
  namespace: string = DEFAULT_DATA_NAMESPACE
): void => {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(namespace)) {
    throw new Error(`Invalid dataNamespace "${namespace}"`);
  }
  dataNamespace = namespace;
  cachedWorkspaceRoot = null;
};

export const getDataNamespace = (): string => dataNamespace;

export const getConfigPath = (): string =>
  path.join(os.homedir(), `.${dataNamespace}-config.json`);

export const getSkillsDir = (): string =>
  path.join(os.homedir(), `.${dataNamespace}-skills`);

export const getConfigDir = (): string => os.homedir();

export const getChatIndexPath = (): string =>
  path.join(os.homedir(), `.${dataNamespace}-chat-index.json`);

/** Name of the hidden data dir inside each workspace */
export const getDataDirName = (): string => `.${dataNamespace}`;

/** True when targetPath is rootPath itself or lies inside it. */
export const isPathWithin = (rootPath: string, targetPath: string): boolean => {
  const relativePath = path.relative(
    path.resolve(rootPath),
    path.resolve(targetPath)
  );
  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
};

/** Read config file, returning raw object */
const readConfig = (): Record<string, unknown> => {
  try {
    if (fs.existsSync(getConfigPath())) {
      return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
    }
  } catch {
    /* corrupt config */
  }
  return {};
};

/** Write config file */
const writeConfig = (config: Record<string, unknown>): void => {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
};

/** Get the current workspace root. Returns null if none selected. */
export const getWorkspaceRoot = (): string | null => {
  if (cachedWorkspaceRoot) return cachedWorkspaceRoot;
  const config = readConfig();
  const root = config.workspaceRoot as string | undefined;
  if (root && fs.existsSync(root)) {
    cachedWorkspaceRoot = root;
    return root;
  }
  return null;
};

/** Persist a new workspace root to the config file */
export const setWorkspaceRoot = (newRoot: string): void => {
  const config = readConfig();
  config.workspaceRoot = newRoot;
  writeConfig(config);
  cachedWorkspaceRoot = newRoot;
};

/** Get recent workspaces list (most recent first, max 10) */
export const getRecentWorkspaces = (): string[] => {
  const config = readConfig();
  const recent = (config.recentWorkspaces as string[]) || [];
  return recent.filter((p) => fs.existsSync(p));
};

/** Add a workspace to the recent list */
export const addRecentWorkspace = (workspacePath: string): void => {
  const config = readConfig();
  let recent = (config.recentWorkspaces as string[]) || [];
  recent = [workspacePath, ...recent.filter((p) => p !== workspacePath)].slice(
    0,
    10
  );
  config.recentWorkspaces = recent;
  writeConfig(config);
};

// ── Internal data directory (hidden inside workspace) ────────────────

/** Get the hidden data dir inside the workspace */
const dataDir = (): string => {
  const root = getWorkspaceRoot();
  if (!root) throw new Error('No workspace selected');
  return path.join(root, getDataDirName());
};

/** Get the artifacts directory for a specific chat */
export const artifactsDir = (chatId: string): string => {
  return path.join(dataDir(), 'artifacts', chatId);
};

/** Get the files directory for a specific chat */
export const filesDir = (chatId: string): string => {
  return path.join(dataDir(), 'files', chatId);
};

/** Ensure base data directories exist inside the workspace */
export const ensureDataDirs = (): void => {
  const d = dataDir();
  fs.mkdirSync(path.join(d, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(d, 'files'), { recursive: true });
};

/** Ensure a specific chat's artifact directory exists */
export const ensureArtifactsDir = (chatId: string): string => {
  const dir = artifactsDir(chatId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/** Ensure a specific chat's files directory exists */
export const ensureFilesDir = (chatId: string): string => {
  const dir = filesDir(chatId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

// ── Filesystem guardrails ────────────────────────────────────────────

/**
 * Validate that a resolved path is within the workspace root.
 * Prevents directory traversal attacks (e.g. ../../etc/passwd).
 * Throws if the path escapes the workspace.
 */
export const assertWithinWorkspace = (targetPath: string): string => {
  const root = getWorkspaceRoot();
  if (!root) throw new Error('No workspace selected');

  const resolved = path.resolve(root, targetPath);
  if (!isPathWithin(root, resolved)) {
    throw new Error(
      `Access denied: path "${targetPath}" is outside the workspace`
    );
  }
  return resolved;
};

/**
 * Resolve a path relative to the workspace root, with guardrail check.
 * Returns the absolute resolved path.
 */
export const resolveWorkspacePath = (relativePath: string): string => {
  return assertWithinWorkspace(relativePath);
};

/** Check if a given path is inside the data directory (not user content) */
export const isDataPath = (targetPath: string): boolean => {
  const resolved = path.resolve(targetPath);
  try {
    return isPathWithin(dataDir(), resolved);
  } catch {
    return false;
  }
};

// ── Chat ↔ Workspace index ───────────────────────────────────────────

/**
 * Maps chatId → workspace root so artifacts can be loaded even after
 * the user switches to a different workspace folder.
 * Stored in ~/.{namespace}-chat-index.json (global, not per-workspace).
 */
const readChatIndex = (): Record<string, string> => {
  try {
    if (fs.existsSync(getChatIndexPath())) {
      return JSON.parse(fs.readFileSync(getChatIndexPath(), 'utf-8'));
    }
  } catch {
    /* corrupt */
  }
  return {};
};

const writeChatIndex = (index: Record<string, string>): void => {
  fs.writeFileSync(getChatIndexPath(), JSON.stringify(index, null, 2), 'utf-8');
};

/** Record that a chat was created/used in a specific workspace */
export const associateChatWithWorkspace = (
  chatId: string,
  workspaceRoot: string
): void => {
  const index = readChatIndex();
  index[chatId] = workspaceRoot;
  writeChatIndex(index);
};

/** Get the workspace root associated with a specific chat */
export const getWorkspaceForChat = (chatId: string): string | null => {
  const index = readChatIndex();
  const ws = index[chatId];
  if (ws && fs.existsSync(ws)) return ws;
  return null;
};

/** Get all chats associated with a specific workspace */
export const getChatsForWorkspace = (workspaceRoot: string): string[] => {
  const index = readChatIndex();
  return Object.entries(index)
    .filter(([, ws]) => ws === workspaceRoot)
    .map(([chatId]) => chatId);
};

// ── Artifact manifest ────────────────────────────────────────────────

interface ArtifactManifestEntry {
  id: string;
  chatId: string;
  title: string;
  filename: string;
  type: string;
  localPath: string;
  createdAt: string;
  language?: string | null;
}

const manifestPath = (chatId: string, workspaceOverride?: string): string => {
  const base = workspaceOverride
    ? path.join(workspaceOverride, getDataDirName())
    : dataDir();
  return path.join(base, 'manifests', `${chatId}.json`);
};

/**
 * Load the artifact manifest for a chat.
 * If the chat belongs to a different workspace (looked up via index),
 * falls back to that workspace's manifest.
 */
export const loadManifest = (chatId: string): ArtifactManifestEntry[] => {
  // Try current workspace first
  try {
    const mp = manifestPath(chatId);
    if (fs.existsSync(mp)) {
      return JSON.parse(fs.readFileSync(mp, 'utf-8'));
    }
  } catch {
    /* corrupt manifest */
  }

  // Fall back to the workspace where this chat was created
  const originalWorkspace = getWorkspaceForChat(chatId);
  if (originalWorkspace) {
    try {
      const mp = manifestPath(chatId, originalWorkspace);
      if (fs.existsSync(mp)) {
        return JSON.parse(fs.readFileSync(mp, 'utf-8'));
      }
    } catch {
      /* corrupt manifest */
    }
  }

  return [];
};

/** Append an entry to the artifact manifest and record the chat-workspace association */
export const appendManifest = (
  chatId: string,
  entry: ArtifactManifestEntry
): void => {
  const mp = manifestPath(chatId);
  // Read directly from current workspace manifest (not via loadManifest
  // which may fall back to another workspace)
  let entries: ArtifactManifestEntry[] = [];
  try {
    if (fs.existsSync(mp)) {
      entries = JSON.parse(fs.readFileSync(mp, 'utf-8'));
    }
  } catch {
    /* corrupt */
  }

  const existing = entries.findIndex((e) => e.id === entry.id);
  if (existing >= 0) {
    entries[existing] = entry;
  } else {
    entries.push(entry);
  }
  fs.mkdirSync(path.dirname(mp), { recursive: true });
  fs.writeFileSync(mp, JSON.stringify(entries, null, 2), 'utf-8');

  const root = getWorkspaceRoot();
  if (root) {
    associateChatWithWorkspace(chatId, root);
  }
};

// ── MCP & Skills config ──────────────────────────────────────────────

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  description?: string;
}

/**
 * A skill is stored as a folder: {skillsDir}/{name}/
 *   SKILL.md  — main entry file (instructions)
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
  /** Absolute path to the skill folder on disk */
  folderPath?: string;
}

/** Metadata persisted in config (no content — read from disk on demand) */
interface SkillMeta {
  id: string;
  name: string;
  enabled: boolean;
}

/** Get MCP servers from config */
export const getMcpServers = (): Record<string, McpServerConfig> => {
  const config = readConfig();
  return (config.mcpServers as Record<string, McpServerConfig>) || {};
};

/** Save MCP servers to config */
export const saveMcpServers = (
  servers: Record<string, McpServerConfig>
): void => {
  const config = readConfig();
  config.mcpServers = servers;
  writeConfig(config);
};

/** Read a skill folder and return a SkillConfig (without id/enabled — caller merges). */
const readSkillFolder = (
  folderPath: string
): Omit<SkillConfig, 'id' | 'enabled'> | null => {
  const mainFile = path.join(folderPath, 'SKILL.md');
  if (!fs.existsSync(mainFile)) return null;

  const raw = fs.readFileSync(mainFile, 'utf-8');

  // Parse YAML frontmatter
  let name = path.basename(folderPath);
  let description = '';
  let body = raw;

  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (fmMatch) {
    const fm = fmMatch[1];
    body = fmMatch[2];
    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    const descMatch = fm.match(/^description:\s*(.+)$/m);
    if (nameMatch) name = nameMatch[1].trim();
    if (descMatch) description = descMatch[1].trim();
  }

  // Collect additional .md files (not SKILL.md)
  const files: Record<string, string> = {};
  try {
    for (const entry of fs.readdirSync(folderPath, {
      withFileTypes: true,
    })) {
      if (
        entry.isFile() &&
        entry.name !== 'SKILL.md' &&
        entry.name.endsWith('.md')
      ) {
        files[entry.name] = fs.readFileSync(
          path.join(folderPath, entry.name),
          'utf-8'
        );
      }
    }
  } catch {
    /* ignore */
  }

  return { name, description, content: body.trim(), files, folderPath };
};

/**
 * Get all installed skills by scanning the skills dir for subdirectories.
 * Merges with config metadata (id, enabled).
 */
export const getSkills = (): SkillConfig[] => {
  const skillsDir = getSkillsDir();
  fs.mkdirSync(skillsDir, { recursive: true });

  const config = readConfig();
  const metas = (config.skills as SkillMeta[]) || [];
  const metaMap = new Map(metas.map((m) => [m.name, m]));

  const skills: SkillConfig[] = [];
  try {
    for (const entry of fs.readdirSync(skillsDir, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      const folderPath = path.join(skillsDir, entry.name);
      const parsed = readSkillFolder(folderPath);
      if (!parsed) continue;

      const meta = metaMap.get(parsed.name);
      skills.push({
        id: meta?.id ?? parsed.name,
        enabled: meta?.enabled ?? true,
        ...parsed,
      });
    }
  } catch {
    /* ignore */
  }

  return skills;
};

/**
 * Save (upsert) a skill to disk and persist metadata in config.
 * Creates {skillsDir}/{name}/SKILL.md and any extra files.
 */
export const saveSkill = (skill: SkillConfig): void => {
  const skillFolder = path.join(getSkillsDir(), skill.name);
  fs.mkdirSync(skillFolder, { recursive: true });

  // Write SKILL.md with frontmatter
  const skillMd = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.content}`;
  fs.writeFileSync(path.join(skillFolder, 'SKILL.md'), skillMd, 'utf-8');

  // Write any additional files
  if (skill.files) {
    for (const [filename, content] of Object.entries(skill.files)) {
      if (filename === 'SKILL.md') continue;
      fs.writeFileSync(path.join(skillFolder, filename), content, 'utf-8');
    }
  }

  // Update config metadata
  const config = readConfig();
  const metas = (config.skills as SkillMeta[]) || [];
  const idx = metas.findIndex(
    (m) => m.id === skill.id || m.name === skill.name
  );
  const meta: SkillMeta = {
    id: skill.id,
    name: skill.name,
    enabled: skill.enabled,
  };
  if (idx >= 0) {
    metas[idx] = meta;
  } else {
    metas.push(meta);
  }
  config.skills = metas;
  writeConfig(config);
};

/** Delete a skill by id: removes its folder and config metadata. */
export const deleteSkill = (skillId: string): void => {
  const config = readConfig();
  const metas = (config.skills as SkillMeta[]) || [];
  const meta = metas.find((m) => m.id === skillId);
  if (meta) {
    const skillFolder = path.join(getSkillsDir(), meta.name);
    if (fs.existsSync(skillFolder)) {
      fs.rmSync(skillFolder, { recursive: true, force: true });
    }
  }
  config.skills = metas.filter((m) => m.id !== skillId);
  writeConfig(config);
};

/**
 * Read a single skill file from a skill folder (for inline editing in the UI).
 * Returns the file content or null if not found.
 */
export const readSkillFile = (
  skillName: string,
  filename: string
): string | null => {
  const filePath = path.join(getSkillsDir(), skillName, filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
};

/**
 * Write a single file inside an existing skill folder.
 */
export const writeSkillFile = (
  skillName: string,
  filename: string,
  content: string
): void => {
  const skillFolder = path.join(getSkillsDir(), skillName);
  fs.mkdirSync(skillFolder, { recursive: true });
  fs.writeFileSync(path.join(skillFolder, filename), content, 'utf-8');
};

/**
 * Delete a supporting file from a skill folder (cannot delete SKILL.md).
 */
export const deleteSkillFile = (skillName: string, filename: string): void => {
  if (filename === 'SKILL.md') return;
  const filePath = path.join(getSkillsDir(), skillName, filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};
