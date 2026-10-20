import {
  app,
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { detectRepoAt, runAllowedGit, runGit } from './git';
import type { ToolExecutor } from './tools';
import {
  addRecentWorkspace,
  assertWithinWorkspace,
  associateChatWithWorkspace,
  deleteSkill,
  deleteSkillFile,
  ensureDataDirs,
  ensureFilesDir,
  getConfigDir,
  getDataDirName,
  getMcpServers,
  getRecentWorkspaces,
  getSkills,
  getSkillsDir,
  getWorkspaceRoot,
  isPathWithin,
  loadManifest,
  readSkillFile,
  saveMcpServers,
  saveSkill,
  setWorkspaceRoot,
  writeSkillFile,
  type McpServerConfig,
  type SkillConfig,
} from './tools/paths';
import {
  callMcpTool,
  getAvailableMcpTools,
  startMcpServers,
} from './tools/mcp-manager';

export type IpcHandler = Parameters<typeof ipcMain.handle>[1];

interface IpcContext {
  getMainWindow: () => BrowserWindow | null;
  tools: Record<string, ToolExecutor>;
}

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/** Resolve filePath against workspacePath, or null if it escapes it. */
const resolveInsideWorkspace = (
  workspacePath: string,
  filePath: string
): string | null => {
  const resolved = path.resolve(workspacePath, filePath);
  return isPathWithin(workspacePath, resolved) ? resolved : null;
};

const readArtifactContent = (localPath: string, ext: string): string => {
  if (ext === 'XLSX') {
    try {
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(localPath);
      const sheetsData: Record<string, unknown[]> = {};
      for (const sheetName of workbook.SheetNames) {
        sheetsData[sheetName] = XLSX.utils.sheet_to_json(
          workbook.Sheets[sheetName]
        );
      }
      return JSON.stringify(sheetsData);
    } catch (e) {
      console.error('Failed to read local xlsx:', e);
      return 'Error reading XLSX';
    }
  }
  try {
    return fs.readFileSync(localPath, 'utf-8');
  } catch {
    return '';
  }
};

const registerToolHandlers = ({ tools }: IpcContext): void => {
  ipcMain.handle(
    'execute-tool',
    async (
      _event: IpcMainInvokeEvent,
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

      const executor = tools[toolName];
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
        return JSON.stringify({ success: false, error: errorMessage(err) });
      }
    }
  );
};

const registerWorkspaceHandlers = ({ getMainWindow }: IpcContext): void => {
  const activateWorkspace = (workspacePath: string): void => {
    setWorkspaceRoot(workspacePath);
    addRecentWorkspace(workspacePath);
    ensureDataDirs();
    getMainWindow()?.webContents.send('workspace-changed', workspacePath);
  };

  ipcMain.handle('get-workspace-path', (): string | null => getWorkspaceRoot());

  ipcMain.handle('get-recent-workspaces', (): string[] =>
    getRecentWorkspaces()
  );

  ipcMain.handle(
    'select-workspace-folder',
    async (): Promise<string | null> => {
      const mainWindow = getMainWindow();
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
      activateWorkspace(selectedPath);
      return selectedPath;
    }
  );

  ipcMain.handle(
    'set-workspace',
    async (
      _event: IpcMainInvokeEvent,
      workspacePath: string
    ): Promise<{ success: boolean; error?: string }> => {
      if (!fs.existsSync(workspacePath)) {
        return { success: false, error: 'Folder does not exist' };
      }
      activateWorkspace(workspacePath);
      return { success: true };
    }
  );

  ipcMain.handle('get-workspace-info', (): Record<string, unknown> | null => {
    const root = getWorkspaceRoot();
    if (!root) return null;

    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      const visibleEntries = entries.filter(
        (entry) => !entry.name.startsWith('.')
      );
      return {
        name: path.basename(root),
        path: root,
        fileCount: visibleEntries.filter((entry) => entry.isFile()).length,
        folderCount: visibleEntries.filter((entry) => entry.isDirectory())
          .length,
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

  ipcMain.handle(
    'list-artifacts',
    async (_event: IpcMainInvokeEvent, chatId: string): Promise<string> => {
      if (!getWorkspaceRoot()) return JSON.stringify([]);

      try {
        const artifacts = loadManifest(chatId)
          .filter((entry) => fs.existsSync(entry.localPath))
          .map((entry, idx) => {
            const ext = path
              .extname(entry.filename)
              .replace('.', '')
              .toUpperCase();
            return {
              id: entry.id,
              chatId: entry.chatId,
              title: entry.title,
              filename: entry.filename,
              type: entry.type,
              seq: idx + 1,
              content: readArtifactContent(entry.localPath, ext),
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

  ipcMain.handle(
    'save-local-file',
    async (
      _event: IpcMainInvokeEvent,
      chatId: string,
      filename: string,
      buffer: ArrayBuffer
    ): Promise<string> => {
      try {
        const filePath = path.join(ensureFilesDir(chatId), filename);
        assertWithinWorkspace(filePath);
        fs.writeFileSync(filePath, Buffer.from(buffer));
        return JSON.stringify({ success: true, filePath, filename });
      } catch (err) {
        return JSON.stringify({ success: false, error: errorMessage(err) });
      }
    }
  );

  ipcMain.handle('list-workspace-files', async (): Promise<string> => {
    const root = getWorkspaceRoot();
    if (!root) return JSON.stringify([]);

    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      const result = entries
        .filter((entry) => !entry.name.startsWith('.'))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: path.join(root, entry.name),
        }));
      return JSON.stringify(result);
    } catch {
      return JSON.stringify([]);
    }
  });

  ipcMain.handle(
    'read-workspace-file',
    (
      _event: IpcMainInvokeEvent,
      workspacePath: string,
      filePath: string
    ): string => {
      try {
        const resolved = resolveInsideWorkspace(workspacePath, filePath);
        if (!resolved) {
          return JSON.stringify({ error: 'Path outside workspace' });
        }
        return fs.readFileSync(resolved, 'utf-8');
      } catch (err) {
        return JSON.stringify({ error: String(err) });
      }
    }
  );

  ipcMain.handle(
    'list-workspace-dir',
    (
      _event: IpcMainInvokeEvent,
      workspacePath: string,
      dirPath: string
    ): Record<string, unknown> => {
      try {
        const resolved = resolveInsideWorkspace(workspacePath, dirPath);
        if (!resolved) return { error: 'Path outside workspace' };
        const items = fs
          .readdirSync(resolved, { withFileTypes: true })
          .filter(
            (entry) =>
              !entry.name.startsWith('.') || entry.name === '.gitignore'
          )
          .map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? 'dir' : 'file',
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

  ipcMain.handle(
    'write-workspace-file',
    (
      _event: IpcMainInvokeEvent,
      workspacePath: string,
      filePath: string,
      content: string
    ): Record<string, unknown> => {
      try {
        const resolved = resolveInsideWorkspace(workspacePath, filePath);
        if (!resolved) return { error: 'Path outside workspace' };
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, content, 'utf-8');
        return { success: true };
      } catch (err) {
        return { error: String(err) };
      }
    }
  );
};

const registerExtensionHandlers = (): void => {
  ipcMain.handle(
    'get-mcp-config',
    (): Record<string, McpServerConfig> => getMcpServers()
  );

  ipcMain.handle(
    'save-mcp-config',
    (
      _event: IpcMainInvokeEvent,
      servers: Record<string, McpServerConfig>
    ): void => saveMcpServers(servers)
  );

  ipcMain.handle('get-skills', (): SkillConfig[] => getSkills());

  ipcMain.handle(
    'save-skill',
    (_event: IpcMainInvokeEvent, skill: SkillConfig): void => saveSkill(skill)
  );

  ipcMain.handle(
    'delete-skill',
    (_event: IpcMainInvokeEvent, skillId: string): void => deleteSkill(skillId)
  );

  ipcMain.handle(
    'read-skill-file',
    (
      _event: IpcMainInvokeEvent,
      skillName: string,
      filename: string
    ): string | null => readSkillFile(skillName, filename)
  );

  ipcMain.handle(
    'write-skill-file',
    (
      _event: IpcMainInvokeEvent,
      skillName: string,
      filename: string,
      content: string
    ): void => writeSkillFile(skillName, filename, content)
  );

  ipcMain.handle(
    'delete-skill-file',
    (_event: IpcMainInvokeEvent, skillName: string, filename: string): void =>
      deleteSkillFile(skillName, filename)
  );

  ipcMain.handle(
    'get-extensions-paths',
    (): { skillsDir: string; configDir: string; dataDirName: string } => ({
      skillsDir: getSkillsDir(),
      configDir: getConfigDir(),
      dataDirName: getDataDirName(),
    })
  );

  ipcMain.handle(
    'start-mcp-servers',
    async (): Promise<{ success: boolean; error?: string }> => {
      try {
        await startMcpServers(getMcpServers());
        return { success: true };
      } catch (err) {
        return { success: false, error: errorMessage(err) };
      }
    }
  );

  ipcMain.handle('get-mcp-tools', (): unknown[] => getAvailableMcpTools());

  ipcMain.handle(
    'call-mcp-tool',
    async (
      _event: IpcMainInvokeEvent,
      serverName: string,
      toolName: string,
      toolInput: Record<string, unknown>
    ): Promise<string> => callMcpTool(serverName, toolName, toolInput)
  );
};

const registerGitHandlers = (): void => {
  ipcMain.handle('git-detect', (): Record<string, unknown> => {
    const root = getWorkspaceRoot();
    if (!root) return { isGit: false, repos: [] };

    const repos: Record<string, unknown>[] = [];
    const rootRepo = detectRepoAt(root);
    if (rootRepo) repos.push(rootRepo);

    // Scan one level of subdirectories for nested git repos
    try {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const subRepo = detectRepoAt(path.join(root, entry.name));
        if (subRepo) repos.push(subRepo);
      }
    } catch {
      /* unreadable dir */
    }

    if (repos.length === 0) return { isGit: false, repos: [] };
    // First repo's fields at top-level for backward compat + full list
    return { ...repos[0], repos };
  });

  ipcMain.handle(
    'git-exec',
    (_event: IpcMainInvokeEvent, args: string[]): string => {
      const root = getWorkspaceRoot();
      if (!root) return JSON.stringify({ error: 'No workspace set' });
      return runAllowedGit(root, args);
    }
  );

  ipcMain.handle(
    'git-exec-at',
    (
      _event: IpcMainInvokeEvent,
      workspacePath: string,
      args: string[]
    ): string => {
      if (!workspacePath || !fs.existsSync(workspacePath)) {
        return JSON.stringify({ error: 'Invalid workspace path' });
      }
      return runAllowedGit(workspacePath, args);
    }
  );

  /** Capture a git snapshot of the workspace before agent processing. Returns SHA. */
  ipcMain.handle(
    'git-snapshot',
    (_event: IpcMainInvokeEvent, workspacePath?: string): string => {
      const root = workspacePath || getWorkspaceRoot();
      if (!root || !fs.existsSync(root)) return '';
      try {
        // Creates a stash object from dirty state without touching the stash stack
        const sha = runGit(root, ['stash', 'create']);
        if (sha) return sha;
        // Working tree is clean — record the current HEAD SHA
        return runGit(root, ['rev-parse', 'HEAD']);
      } catch {
        return '';
      }
    }
  );

  ipcMain.handle(
    'git-restore-snapshot',
    (
      _event: IpcMainInvokeEvent,
      workspacePath: string,
      sha: string
    ): Record<string, unknown> => {
      if (!workspacePath || !fs.existsSync(workspacePath) || !sha) {
        return { error: 'Invalid workspace or SHA' };
      }
      try {
        runGit(workspacePath, ['checkout', sha, '--', '.']);
        return { success: true };
      } catch (err) {
        return { error: String(err) };
      }
    }
  );
};

export const registerIpcHandlers = (
  context: IpcContext,
  extraIpcHandlers: Record<string, IpcHandler> = {}
): void => {
  registerToolHandlers(context);
  registerWorkspaceHandlers(context);
  registerExtensionHandlers();
  registerGitHandlers();
  for (const [channel, handler] of Object.entries(extraIpcHandlers)) {
    ipcMain.handle(channel, handler);
  }
};
