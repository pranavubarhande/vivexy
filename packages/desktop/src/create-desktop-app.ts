import { app, BrowserWindow, net, protocol } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { registerIpcHandlers, type IpcHandler } from './ipc-handlers';
import { toolRegistry, type ToolExecutor } from './tools';
import { startMcpServers, stopAllMcpServers } from './tools/mcp-manager';
import {
  configureDataNamespace,
  ensureDataDirs,
  getMcpServers,
  getWorkspaceRoot,
  isPathWithin,
} from './tools/paths';

export interface DesktopWindowOptions {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
}

export interface DesktopAppConfig {
  /** Window title */
  productName: string;
  window?: DesktopWindowOptions;
  /** Privileged scheme serving the packaged renderer (default 'app') */
  scheme?: string;
  /** Static frontend export served in packaged builds (default <resources>/renderer) */
  rendererDir?: string;
  /** URL loaded when not packaged (default $FRONTEND_URL or http://localhost:3000) */
  devUrl?: string;
  /** Compiled preload script (default preload.js next to the app's main script) */
  preloadPath?: string;
  /** Prefix for every on-disk name: ~/.{ns}-config.json, ~/.{ns}-skills, {workspace}/.{ns} … (default 'vivexy') */
  dataNamespace?: string;
  /** Additional client tools, merged over the built-in registry */
  extraTools?: Record<string, ToolExecutor>;
  /** Additional ipcMain.handle channels */
  extraIpcHandlers?: Record<string, IpcHandler>;
}

export interface DesktopApp {
  getMainWindow: () => BrowserWindow | null;
}

const DEFAULT_WINDOW: Required<DesktopWindowOptions> = {
  width: 1400,
  height: 900,
  minWidth: 800,
  minHeight: 600,
};

const defaultPreloadPath = (): string => {
  const mainScript = require.main?.filename;
  const mainDir = mainScript ? path.dirname(mainScript) : app.getAppPath();
  return path.join(mainDir, 'preload.js');
};

/** Map an app:// pathname to a file in rendererDir, falling back to index.html (SPA). */
const resolveRendererFile = (rendererDir: string, pathname: string): string => {
  const indexFile = path.join(rendererDir, 'index.html');
  let filePath = path.join(rendererDir, pathname);
  if (!isPathWithin(rendererDir, filePath)) return indexFile;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  return fs.existsSync(filePath) ? filePath : indexFile;
};

/**
 * Wire up the whole Electron main process. Must be called synchronously at
 * the top level of the app's main script: the privileged scheme has to be
 * registered before the app is ready.
 */
export const createDesktopApp = (config: DesktopAppConfig): DesktopApp => {
  const scheme = config.scheme ?? 'app';
  const windowOptions = { ...DEFAULT_WINDOW, ...config.window };
  const preloadPath = config.preloadPath ?? defaultPreloadPath();
  const devUrl =
    config.devUrl ?? (process.env.FRONTEND_URL || 'http://localhost:3000');

  configureDataNamespace(config.dataNamespace);

  protocol.registerSchemesAsPrivileged([
    {
      scheme,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);

  let mainWindow: BrowserWindow | null = null;

  const createWindow = (): void => {
    mainWindow = new BrowserWindow({
      ...windowOptions,
      title: config.productName,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (app.isPackaged) {
      mainWindow.loadURL(`${scheme}://localhost/`);
    } else {
      mainWindow.loadURL(devUrl);
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  };

  registerIpcHandlers(
    {
      getMainWindow: () => mainWindow,
      tools: { ...toolRegistry, ...config.extraTools },
    },
    config.extraIpcHandlers
  );

  app.whenReady().then(() => {
    // Serve the static frontend export via a privileged scheme so absolute
    // paths like /_next/static/... resolve (file:// breaks them).
    if (app.isPackaged) {
      const rendererDir =
        config.rendererDir ?? path.join(process.resourcesPath, 'renderer');
      protocol.handle(scheme, (request) => {
        const { pathname } = new URL(request.url);
        return net.fetch(
          `file://${resolveRendererFile(rendererDir, pathname)}`
        );
      });
    }

    if (getWorkspaceRoot()) {
      ensureDataDirs();
    }

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

  return { getMainWindow: () => mainWindow };
};
