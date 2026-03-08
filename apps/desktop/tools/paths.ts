/**
 * Path helpers for the Electron app's local data storage.
 *
 * The workspace root is user-configurable (Claude Code-style):
 *   - No default: user must select a folder on first launch
 *   - Persisted in ~/.portfolio-helper-config.json
 *   - All agent file operations are sandboxed to this folder
 *
 * Within the workspace:
 *   .portfolio-helper/artifacts/{chatId}/  – generated artifacts
 *   .portfolio-helper/files/{chatId}/      – uploaded / managed files
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const CONFIG_PATH = path.join(os.homedir(), '.portfolio-helper-config.json');

let _cachedRoot: string | null = null;

/** Read config file, returning raw object */
const readConfig = (): Record<string, unknown> => {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        }
    } catch {
        /* corrupt config */
    }
    return {};
};

/** Write config file */
const writeConfig = (config: Record<string, unknown>): void => {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
};

/** Get the current workspace root. Returns null if none selected. */
export const getWorkspaceRoot = (): string | null => {
    if (_cachedRoot) return _cachedRoot;
    const config = readConfig();
    const root = config.workspaceRoot as string | undefined;
    if (root && fs.existsSync(root)) {
        _cachedRoot = root;
        return root;
    }
    return null;
};

/** Persist a new workspace root to the config file */
export const setWorkspaceRoot = (newRoot: string): void => {
    const config = readConfig();
    config.workspaceRoot = newRoot;
    writeConfig(config);
    _cachedRoot = newRoot;
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
    recent = [
        workspacePath,
        ...recent.filter((p) => p !== workspacePath),
    ].slice(0, 10);
    config.recentWorkspaces = recent;
    writeConfig(config);
};

// ── Internal data directory (hidden inside workspace) ────────────────
const DATA_DIR = '.portfolio-helper';

/** Get the hidden data dir inside the workspace */
const dataDir = (): string => {
    const root = getWorkspaceRoot();
    if (!root) throw new Error('No workspace selected');
    return path.join(root, DATA_DIR);
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
    const normalizedRoot = path.resolve(root) + path.sep;

    if (
        !resolved.startsWith(normalizedRoot) &&
        resolved !== path.resolve(root)
    ) {
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
        const d = dataDir();
        return resolved.startsWith(d);
    } catch {
        return false;
    }
};

// ── Chat ↔ Workspace index ───────────────────────────────────────────

/**
 * Maps chatId → workspace root so artifacts can be loaded even after
 * the user switches to a different workspace folder.
 * Stored in ~/.portfolio-helper-chat-index.json (global, not per-workspace).
 */
const CHAT_INDEX_PATH = path.join(
    os.homedir(),
    '.portfolio-helper-chat-index.json'
);

const readChatIndex = (): Record<string, string> => {
    try {
        if (fs.existsSync(CHAT_INDEX_PATH)) {
            return JSON.parse(fs.readFileSync(CHAT_INDEX_PATH, 'utf-8'));
        }
    } catch {
        /* corrupt */
    }
    return {};
};

const writeChatIndex = (index: Record<string, string>): void => {
    fs.writeFileSync(CHAT_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
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
        ? path.join(workspaceOverride, DATA_DIR)
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
