/**
 * Electron Main Process
 *
 * Loads the Next.js frontend in a BrowserWindow and provides IPC handlers
 * for client-side tool execution, workspace management, and artifact storage.
 *
 * Workspace model (Claude Code-style):
 *   - User selects a project folder on first launch
 *   - All agent file operations are sandboxed to this folder
 *   - Hidden data dir (.vivexy/) stores artifacts and uploaded files
 */

import { app, BrowserWindow, dialog, ipcMain, protocol, net } from 'electron';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Register before app is ready — required by Electron
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: {
            secure: true,
            standard: true,
            supportFetchAPI: true,
            corsEnabled: true,
        },
    },
]);
import {
    getWorkspaceRoot,
    setWorkspaceRoot,
    getRecentWorkspaces,
    addRecentWorkspace,
    ensureDataDirs,
    assertWithinWorkspace,
    loadManifest,
    associateChatWithWorkspace,
    getMcpServers,
    saveMcpServers,
    getSkills,
    saveSkill,
    deleteSkill,
    readSkillFile,
    writeSkillFile,
    deleteSkillFile,
    SKILLS_DIR,
    CONFIG_DIR,
    type McpServerConfig,
    type SkillConfig,
} from '@/tools/paths';
import { toolRegistry } from '@/tools';
import {
    startMcpServers,
    stopAllMcpServers,
    getAvailableMcpTools,
    callMcpTool,
} from '@/tools/mcp-manager';

let mainWindow: BrowserWindow | null = null;

const createWindow = (): void => {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        title: 'Vivexy',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (app.isPackaged) {
        mainWindow.loadURL('app://localhost/');
    } else {
        mainWindow.loadURL(process.env.FRONTEND_URL || 'http://localhost:3000');
    }

    if (!app.isPackaged) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

// ── IPC Handlers ──────────────────────────────────────────────────────

ipcMain.handle(
    'execute-tool',
    async (
        _event: Electron.IpcMainInvokeEvent,
        toolName: string,
        toolInput: Record<string, unknown>
    ): Promise<string> => {
        if (!getWorkspaceRoot()) {
            return JSON.stringify({
                success: false,
                error: 'No workspace selected. Please select a project folder first.',
            });
        }

        // MCP tools are namespaced as "mcp__{serverName}__{toolName}"
        const mcpMatch = toolName.match(/^mcp__(.+?)__(.+)$/);
        if (mcpMatch) {
            const [, serverName, mcpToolName] = mcpMatch;
            return callMcpTool(serverName, mcpToolName, toolInput);
        }

        const executor = toolRegistry[toolName];
        if (!executor) {
            return JSON.stringify({
                success: false,
                error: `Unknown client tool: ${toolName}`,
            });
        }
        try {
            const chatId = toolInput.chat_id as string | undefined;
            const root = getWorkspaceRoot();
            if (chatId && root) {
                associateChatWithWorkspace(chatId, root);
            }
            const result = await executor(toolInput);
            return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (err) {
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
);

/** Return the current workspace root path (null if none selected) */
ipcMain.handle('get-workspace-path', (): string | null => {
    return getWorkspaceRoot();
});

/** Return recent workspaces list */
ipcMain.handle('get-recent-workspaces', (): string[] => {
    return getRecentWorkspaces();
});

/** Open a native folder picker and set as workspace root */
ipcMain.handle('select-workspace-folder', async (): Promise<string | null> => {
    if (!mainWindow) return null;

    const currentRoot = getWorkspaceRoot();
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Project Folder',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: currentRoot || app.getPath('home'),
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    const selectedPath = result.filePaths[0];
    setWorkspaceRoot(selectedPath);
    addRecentWorkspace(selectedPath);
    ensureDataDirs();
    mainWindow?.webContents.send('workspace-changed', selectedPath);

    return selectedPath;
});

/** Set a workspace directly (e.g. from recent workspaces list) */
ipcMain.handle(
    'set-workspace',
    async (
        _event: Electron.IpcMainInvokeEvent,
        workspacePath: string
    ): Promise<{ success: boolean; error?: string }> => {
        if (!fs.existsSync(workspacePath)) {
            return { success: false, error: 'Folder does not exist' };
        }
        setWorkspaceRoot(workspacePath);
        addRecentWorkspace(workspacePath);
        ensureDataDirs();
        mainWindow?.webContents.send('workspace-changed', workspacePath);
        return { success: true };
    }
);

/** Get workspace info (name, path, file count) */
ipcMain.handle('get-workspace-info', (): Record<string, unknown> | null => {
    const root = getWorkspaceRoot();
    if (!root) return null;

    try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        const files = entries.filter(
            (e) => !e.name.startsWith('.') && e.isFile()
        ).length;
        const folders = entries.filter(
            (e) => !e.name.startsWith('.') && e.isDirectory()
        ).length;

        return {
            name: path.basename(root),
            path: root,
            fileCount: files,
            folderCount: folders,
        };
    } catch {
        return {
            name: path.basename(root),
            path: root,
            fileCount: 0,
            folderCount: 0,
        };
    }
});

/**
 * List saved artifacts for a specific chat using the manifest.
 * Artifacts are stored in the workspace root (or a user-specified
 * subfolder) and tracked via .vivexy/manifests/{chatId}.json.
 */
ipcMain.handle(
    'list-artifacts',
    async (
        _event: Electron.IpcMainInvokeEvent,
        chatId: string
    ): Promise<string> => {
        if (!getWorkspaceRoot()) return JSON.stringify([]);

        try {
            const manifest = loadManifest(chatId);
            const artifacts = manifest
                .filter((entry) => fs.existsSync(entry.localPath))
                .map((entry, idx) => {
                    const ext = path
                        .extname(entry.filename)
                        .replace('.', '')
                        .toUpperCase();
                    let content = '';

                    if (ext === 'XLSX') {
                        try {
                            const XLSX = require('xlsx');
                            const workbook = XLSX.readFile(entry.localPath);
                            const sheetsData: Record<string, unknown[]> = {};
                            for (const sheetName of workbook.SheetNames) {
                                sheetsData[sheetName] =
                                    XLSX.utils.sheet_to_json(
                                        workbook.Sheets[sheetName]
                                    );
                            }
                            content = JSON.stringify(sheetsData);
                        } catch (e) {
                            console.error('Failed to read local xlsx:', e);
                            content = 'Error reading XLSX';
                        }
                    } else {
                        try {
                            content = fs.readFileSync(entry.localPath, 'utf-8');
                        } catch {
                            content = '';
                        }
                    }

                    return {
                        id: entry.id,
                        chatId: entry.chatId,
                        title: entry.title,
                        filename: entry.filename,
                        type: entry.type,
                        seq: idx + 1,
                        content,
                        createdAt: entry.createdAt,
                        metadata: { localPath: entry.localPath },
                    };
                });

            return JSON.stringify(artifacts);
        } catch (err) {
            console.error('Failed to list artifacts:', err);
            return JSON.stringify([]);
        }
    }
);

/** Save an uploaded file to the workspace (within guardrails) */
ipcMain.handle(
    'save-local-file',
    async (
        _event,
        chatId: string,
        filename: string,
        buffer: ArrayBuffer
    ): Promise<string> => {
        try {
            const { ensureFilesDir } = require('./tools/paths');
            const dir = ensureFilesDir(chatId);
            const filePath = path.join(dir, filename);

            assertWithinWorkspace(filePath);

            fs.writeFileSync(filePath, Buffer.from(buffer));

            return JSON.stringify({
                success: true,
                filePath,
                filename,
            });
        } catch (err) {
            return JSON.stringify({
                success: false,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }
);

/**
 * List files in the workspace root (for agent context).
 * Only lists top-level, non-hidden files/folders.
 */
ipcMain.handle('list-workspace-files', async (): Promise<string> => {
    const root = getWorkspaceRoot();
    if (!root) return JSON.stringify([]);

    try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        const result = entries
            .filter((e) => !e.name.startsWith('.'))
            .map((e) => ({
                name: e.name,
                type: e.isDirectory() ? 'directory' : 'file',
                path: path.join(root, e.name),
            }));
        return JSON.stringify(result);
    } catch {
        return JSON.stringify([]);
    }
});

// ── MCP & Skills IPC ──────────────────────────────────────────────────

/** Get all MCP server configurations */
ipcMain.handle('get-mcp-config', (): Record<string, McpServerConfig> => {
    return getMcpServers();
});

/** Save MCP server configurations */
ipcMain.handle(
    'save-mcp-config',
    (
        _event: Electron.IpcMainInvokeEvent,
        servers: Record<string, McpServerConfig>
    ): void => {
        saveMcpServers(servers);
    }
);

/** Get all skills */
ipcMain.handle('get-skills', (): SkillConfig[] => {
    return getSkills();
});

/** Save (upsert) a single skill */
ipcMain.handle(
    'save-skill',
    (_event: Electron.IpcMainInvokeEvent, skill: SkillConfig): void => {
        saveSkill(skill);
    }
);

/** Delete a skill by id */
ipcMain.handle(
    'delete-skill',
    (_event: Electron.IpcMainInvokeEvent, skillId: string): void => {
        deleteSkill(skillId);
    }
);

/** Read a single file from a skill folder */
ipcMain.handle(
    'read-skill-file',
    (
        _event: Electron.IpcMainInvokeEvent,
        skillName: string,
        filename: string
    ): string | null => {
        return readSkillFile(skillName, filename);
    }
);

/** Write a single file inside a skill folder */
ipcMain.handle(
    'write-skill-file',
    (
        _event: Electron.IpcMainInvokeEvent,
        skillName: string,
        filename: string,
        content: string
    ): void => {
        writeSkillFile(skillName, filename, content);
    }
);

/** Delete a supporting file from a skill folder */
ipcMain.handle(
    'delete-skill-file',
    (
        _event: Electron.IpcMainInvokeEvent,
        skillName: string,
        filename: string
    ): void => {
        deleteSkillFile(skillName, filename);
    }
);

/** Return the skills directory path and config directory path */
ipcMain.handle(
    'get-extensions-paths',
    (): { skillsDir: string; configDir: string } => {
        return { skillsDir: SKILLS_DIR, configDir: CONFIG_DIR };
    }
);

/** Start/restart MCP servers from current saved config */
ipcMain.handle(
    'start-mcp-servers',
    async (): Promise<{ success: boolean; error?: string }> => {
        try {
            const servers = getMcpServers();
            await startMcpServers(servers);
            return { success: true };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
);

/** Get all available MCP tool definitions from currently running servers */
ipcMain.handle('get-mcp-tools', (): unknown[] => {
    return getAvailableMcpTools();
});

/** Execute an MCP tool call on the specified server */
ipcMain.handle(
    'call-mcp-tool',
    async (
        _event: Electron.IpcMainInvokeEvent,
        serverName: string,
        toolName: string,
        toolInput: Record<string, unknown>
    ): Promise<string> => {
        return callMcpTool(serverName, toolName, toolInput);
    }
);

// ── Git helpers ───────────────────────────────────────────────────────

const SAFE_GIT_SUBCOMMANDS = new Set([
    'status',
    'log',
    'diff',
    'branch',
    'show',
    'blame',
    'checkout',
    'ls-tree',
]);

function gitRun(cwd: string, args: string[]): string {
    return execSync(
        `git ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`,
        {
            cwd,
            stdio: 'pipe',
            timeout: 10_000,
        }
    )
        .toString()
        .trim();
}

function detectRepoAt(dir: string): Record<string, unknown> | null {
    try {
        gitRun(dir, ['rev-parse', '--git-dir']);
        const branch = gitRun(dir, ['branch', '--show-current']);
        let remote = '';
        try {
            remote = gitRun(dir, ['remote', 'get-url', 'origin']);
        } catch {
            /* no remote */
        }
        return {
            isGit: true,
            branch,
            remote,
            repoName: path.basename(dir),
            workspacePath: dir,
        };
    } catch {
        return null;
    }
}

ipcMain.handle('git-detect', (): Record<string, unknown> => {
    const root = getWorkspaceRoot();
    if (!root) return { isGit: false, repos: [] };

    const repos: Record<string, unknown>[] = [];

    // Check the workspace root itself
    const rootRepo = detectRepoAt(root);
    if (rootRepo) repos.push(rootRepo);

    // Scan one level of subdirectories for nested git repos
    try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
            const subdir = path.join(root, entry.name);
            const subRepo = detectRepoAt(subdir);
            if (subRepo) repos.push(subRepo);
        }
    } catch {
        /* unreadable dir */
    }

    if (repos.length === 0) return { isGit: false, repos: [] };
    // Return the first repo's fields at top-level for backward compat + full list
    return { ...repos[0], repos };
});

ipcMain.handle(
    'git-exec',
    (_event: Electron.IpcMainInvokeEvent, args: string[]): string => {
        const root = getWorkspaceRoot();
        if (!root) return JSON.stringify({ error: 'No workspace set' });
        if (!args.length || !SAFE_GIT_SUBCOMMANDS.has(args[0])) {
            return JSON.stringify({
                error: `Git subcommand '${args[0]}' not allowed`,
            });
        }
        try {
            return gitRun(root, args);
        } catch (err) {
            return JSON.stringify({ error: String(err) });
        }
    }
);

ipcMain.handle(
    'git-exec-at',
    (
        _event: Electron.IpcMainInvokeEvent,
        workspacePath: string,
        args: string[]
    ): string => {
        if (!workspacePath || !fs.existsSync(workspacePath)) {
            return JSON.stringify({ error: 'Invalid workspace path' });
        }
        if (!args.length || !SAFE_GIT_SUBCOMMANDS.has(args[0])) {
            return JSON.stringify({
                error: `Git subcommand '${args[0]}' not allowed`,
            });
        }
        try {
            return gitRun(workspacePath, args);
        } catch (err) {
            return JSON.stringify({ error: String(err) });
        }
    }
);

/** Capture a git snapshot of the workspace before agent processing. Returns SHA. */
ipcMain.handle(
    'git-snapshot',
    (_event: Electron.IpcMainInvokeEvent, workspacePath?: string): string => {
        const root = workspacePath || getWorkspaceRoot();
        if (!root || !fs.existsSync(root)) return '';
        try {
            // git stash create: creates a stash object from dirty state without modifying the stash stack
            const sha = execSync('git stash create', {
                cwd: root,
                stdio: 'pipe',
                timeout: 10_000,
            })
                .toString()
                .trim();
            if (sha) return sha;
            // Working tree is clean — record the current HEAD SHA
            return gitRun(root, ['rev-parse', 'HEAD']);
        } catch {
            return '';
        }
    }
);

/** Restore workspace files to a previously snapshotted git SHA. */
ipcMain.handle(
    'git-restore-snapshot',
    (
        _event: Electron.IpcMainInvokeEvent,
        workspacePath: string,
        sha: string
    ): Record<string, unknown> => {
        if (!workspacePath || !fs.existsSync(workspacePath) || !sha) {
            return { error: 'Invalid workspace or SHA' };
        }
        try {
            gitRun(workspacePath, ['checkout', sha, '--', '.']);
            return { success: true };
        } catch (err) {
            return { error: String(err) };
        }
    }
);

/** Read a file within a given workspace path (security: must be within the path) */
ipcMain.handle(
    'read-workspace-file',
    (
        _event: Electron.IpcMainInvokeEvent,
        workspacePath: string,
        filePath: string
    ): string => {
        try {
            const resolved = path.resolve(workspacePath, filePath);
            // Ensure we stay within the workspace
            if (!resolved.startsWith(path.resolve(workspacePath))) {
                return JSON.stringify({ error: 'Path outside workspace' });
            }
            const content = fs.readFileSync(resolved, 'utf-8');
            return content;
        } catch (err) {
            return JSON.stringify({ error: String(err) });
        }
    }
);

/** List files and folders in a directory within a workspace */
ipcMain.handle(
    'list-workspace-dir',
    (
        _event: Electron.IpcMainInvokeEvent,
        workspacePath: string,
        dirPath: string
    ): Record<string, unknown> => {
        try {
            const resolved = path.resolve(workspacePath, dirPath);
            if (!resolved.startsWith(path.resolve(workspacePath))) {
                return { error: 'Path outside workspace' };
            }
            const entries = fs.readdirSync(resolved, { withFileTypes: true });
            const items = entries
                .filter(
                    (e) => !e.name.startsWith('.') || e.name === '.gitignore'
                )
                .map((e) => ({
                    name: e.name,
                    type: e.isDirectory() ? 'dir' : 'file',
                }))
                .sort((a, b) => {
                    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
            return { items };
        } catch (err) {
            return { error: String(err) };
        }
    }
);

/** Write a file within the workspace */
ipcMain.handle(
    'write-workspace-file',
    (
        _event: Electron.IpcMainInvokeEvent,
        workspacePath: string,
        filePath: string,
        content: string
    ): Record<string, unknown> => {
        try {
            const resolved = path.resolve(workspacePath, filePath);
            if (!resolved.startsWith(path.resolve(workspacePath))) {
                return { error: 'Path outside workspace' };
            }
            fs.mkdirSync(path.dirname(resolved), { recursive: true });
            fs.writeFileSync(resolved, content, 'utf-8');
            return { success: true };
        } catch (err) {
            return { error: String(err) };
        }
    }
);

// ── App Lifecycle ─────────────────────────────────────────────────────

app.whenReady().then(async () => {
    // Serve static Next.js export via app:// so absolute paths like
    // /_next/static/... resolve correctly (file:// breaks them).
    if (app.isPackaged) {
        const rendererDir = path.join(process.resourcesPath, 'renderer');
        protocol.handle('app', (request) => {
            const url = new URL(request.url);
            let filePath = path.join(rendererDir, url.pathname);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
                filePath = path.join(filePath, 'index.html');
            }
            if (!fs.existsSync(filePath)) {
                filePath = path.join(rendererDir, 'index.html');
            }
            return net.fetch(`file://${filePath}`);
        });
    }

    const root = getWorkspaceRoot();
    if (root) {
        ensureDataDirs();
    }

    // Auto-start any enabled MCP servers from saved config
    const savedServers = getMcpServers();
    if (Object.keys(savedServers).length > 0) {
        startMcpServers(savedServers).catch((err) =>
            console.error('[MCP] Auto-start failed:', err)
        );
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('before-quit', async () => {
    await stopAllMcpServers();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
