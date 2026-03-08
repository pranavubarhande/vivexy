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
} from '@/tools/paths';
import { toolRegistry } from '@/tools';

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

// ── App Lifecycle ─────────────────────────────────────────────────────

app.whenReady().then(() => {
    const root = getWorkspaceRoot();
    if (root) {
        ensureDataDirs();
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
