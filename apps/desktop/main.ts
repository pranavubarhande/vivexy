/**
 * Electron Main Process
 *
 * Loads the Next.js frontend in a BrowserWindow and provides IPC handlers
 * for client-side tool execution, workspace management, and artifact storage.
 *
 * Workspace model (Claude Code-style):
 *   - User selects a project folder on first launch
 *   - All agent file operations are sandboxed to this folder
 *   - Hidden data dir (.portfolio-helper/) stores artifacts and uploaded files
 */

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
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
        title: 'Portfolio Helper',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    const devUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    mainWindow.loadURL(devUrl);

    if (process.env.NODE_ENV !== 'production') {
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
 * subfolder) and tracked via .portfolio-helper/manifests/{chatId}.json.
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

// ── App Lifecycle ─────────────────────────────────────────────────────

app.whenReady().then(async () => {
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
