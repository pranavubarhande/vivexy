# @vivexy/desktop

The Electron runtime behind the Vivexy desktop app, packaged so other products
(e.g. Vivexy Legal) can ship their own desktop app on the same code.

It provides:

- **`createDesktopApp(config)`** (main process): privileged `app://` scheme,
  window creation, the protocol handler serving the static frontend export
  (with SPA fallback to `index.html`), every `ipcMain` handler behind
  `window.electronAPI` (tools, workspaces, artifacts, MCP, skills, git), MCP
  server auto-start/stop and the app lifecycle.
- **`exposeElectronAPI(extra?)`** (preload, `@vivexy/desktop/preload`):
  exposes the `window.electronAPI` contract typed in
  `@vivexy/core/types/electron`, plus optional extra members.

The package ships compiled CommonJS with type declarations. `electron` is a
peer dependency.

## Usage

```ts
// main.ts — call at the top level, not inside app.whenReady():
// the privileged scheme must be registered before the app is ready.
import * as path from 'path';
import { createDesktopApp } from '@vivexy/desktop';

createDesktopApp({
  productName: 'Vivexy Legal',
  dataNamespace: 'vivexy-legal',
  preloadPath: path.join(__dirname, 'preload.js'),
  extraTools: {
    redact_document: async (input) => JSON.stringify({ success: true }),
  },
  extraIpcHandlers: {
    'get-matter-list': async () => [],
  },
});
```

```ts
// preload.ts
import { ipcRenderer } from 'electron';
import { exposeElectronAPI } from '@vivexy/desktop/preload';

exposeElectronAPI({
  getMatterList: () => ipcRenderer.invoke('get-matter-list'),
});
```

Built-in `electronAPI` members always win over `extra` members with the same
name, so the core contract cannot be broken by accident.

### Bundle the preload script

Electron sandboxes preload scripts by default, and a sandboxed preload can
only `require('electron')`. Bundle the preload into a single file, e.g.

```sh
esbuild preload.ts --bundle --platform=node --format=cjs --external:electron --outfile=dist/preload.js
```

The main process needs no bundling: compile it with `tsc` as usual.

## Config

| Field              | Default                                                       | Purpose                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `productName`      | required                                                      | Window title.                                                                                                                                                                                                                      |
| `window`           | `{ width: 1400, height: 900, minWidth: 800, minHeight: 600 }` | Window size; any field may be overridden.                                                                                                                                                                                          |
| `scheme`           | `'app'`                                                       | Privileged scheme the packaged renderer is served from (`app://localhost/`).                                                                                                                                                       |
| `rendererDir`      | `path.join(process.resourcesPath, 'renderer')`                | Static frontend export served in packaged builds.                                                                                                                                                                                  |
| `devUrl`           | `process.env.FRONTEND_URL` or `http://localhost:3000`         | URL loaded when the app is not packaged (DevTools open detached).                                                                                                                                                                  |
| `preloadPath`      | `preload.js` next to the app's main script                    | Compiled preload script. Pass it explicitly: `path.join(__dirname, 'preload.js')`.                                                                                                                                                 |
| `dataNamespace`    | `'vivexy'`                                                    | Prefix of every on-disk name: `~/.{ns}-config.json`, `~/.{ns}-skills/`, `~/.{ns}-chat-index.json`, the per-workspace `.{ns}/` data dir, and the MCP client name `{ns}-desktop`. Use a distinct one per product to keep data apart. |
| `extraTools`       | `{}`                                                          | `Record<string, (input) => Promise<string>>` merged over the built-in tool registry and reachable through `executeTool`.                                                                                                           |
| `extraIpcHandlers` | `{}`                                                          | `Record<channel, handler>` registered with `ipcMain.handle`.                                                                                                                                                                       |

`createDesktopApp` returns `{ getMainWindow }`.

The main entry also exports helpers for writing extra tools:
`getWorkspaceRoot`, `assertWithinWorkspace`, `isPathWithin`,
`resolveWorkspacePath`, `filesDir`, `ensureFilesDir`, `getDataNamespace`,
`toolRegistry` and the `ToolExecutor`, `McpServerConfig`, `SkillConfig` types.

## A product app (e.g. vivexy-legal)

A product's desktop app is a thin folder holding `main.ts`, `preload.ts`,
`package.json` and `electron-builder.yml`:

```jsonc
// package.json
{
  "name": "vivexy-legal-desktop",
  "private": true,
  "main": "dist/main.js",
  "scripts": {
    "build": "tsc && esbuild preload.ts --bundle --platform=node --format=cjs --external:electron --outfile=dist/preload.js",
    "build:renderer": "cd ../frontend && NEXT_DESKTOP=1 npx next build && cp -r out/ ../desktop/renderer/",
    "build:all": "npm run build:renderer && npm run build",
    "package": "npm run build:all && electron-builder",
  },
  "dependencies": { "@vivexy/desktop": "^0.2.0" },
  "devDependencies": {
    "electron": "33.4.11",
    "electron-builder": "^25.1.8",
    "esbuild": "^0.25.0",
    "typescript": "^5.7.0",
  },
}
```

`build:renderer` points at the product's own frontend; the static export
must land in `renderer/`, which `electron-builder.yml` copies into the app
resources (the default `rendererDir`):

```yaml
appId: com.vivexy.legal
productName: Vivexy Legal
files:
  - 'dist/**/*'
  - 'package.json'
extraResources:
  - from: renderer/
    to: renderer/
```

electron-builder bundles production dependencies from `node_modules`, which
includes `@vivexy/desktop` and its runtime dependencies.

## Developing against a local checkout

`apps/desktop` in this repo depends on `file:../../packages/desktop` with
`install-links=true` in its `.npmrc`, so npm installs a real copy (which
electron-builder can bundle) rather than a symlink. After changing this
package, rebuild and reinstall it there:

```sh
cd apps/desktop
npm run build:package    # npm install + tsc in packages/desktop
npm run install:package  # replace the installed copy
```

This package is not part of the root npm workspaces and has its own
`package-lock.json`. Scripts: `npm run build`, `npm run typecheck`,
`npm test`.
