export {
  createDesktopApp,
  type DesktopApp,
  type DesktopAppConfig,
  type DesktopWindowOptions,
} from './create-desktop-app';
export type { IpcHandler } from './ipc-handlers';
export { toolRegistry, type ToolExecutor } from './tools';
export {
  assertWithinWorkspace,
  ensureFilesDir,
  filesDir,
  getDataNamespace,
  getWorkspaceRoot,
  isPathWithin,
  resolveWorkspacePath,
  type McpServerConfig,
  type SkillConfig,
} from './tools/paths';
export type { McpToolDefinition } from './tools/mcp-manager';
