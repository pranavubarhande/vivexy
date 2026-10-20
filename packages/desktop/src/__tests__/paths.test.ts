import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertWithinWorkspace,
  configureDataNamespace,
  filesDir,
  getChatIndexPath,
  getConfigDir,
  getConfigPath,
  getSkillsDir,
  isDataPath,
  isPathWithin,
  setWorkspaceRoot,
} from '../tools/paths';

const originalHome = process.env.HOME;
let homeDir: string;
let workspaceDir: string;

beforeEach(() => {
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-home-'));
  workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-ws-'));
  process.env.HOME = homeDir;
  configureDataNamespace();
});

afterEach(() => {
  process.env.HOME = originalHome;
  fs.rmSync(homeDir, { recursive: true, force: true });
  fs.rmSync(workspaceDir, { recursive: true, force: true });
});

describe('data paths', () => {
  it('defaults to the legacy vivexy locations', () => {
    expect(getConfigPath()).toBe(path.join(homeDir, '.vivexy-config.json'));
    expect(getSkillsDir()).toBe(path.join(homeDir, '.vivexy-skills'));
    expect(getChatIndexPath()).toBe(
      path.join(homeDir, '.vivexy-chat-index.json')
    );
    expect(getConfigDir()).toBe(homeDir);

    setWorkspaceRoot(workspaceDir);
    expect(filesDir('chat-1')).toBe(
      path.join(workspaceDir, '.vivexy', 'files', 'chat-1')
    );
    expect(
      JSON.parse(
        fs.readFileSync(path.join(homeDir, '.vivexy-config.json'), 'utf-8')
      ).workspaceRoot
    ).toBe(workspaceDir);
  });

  it('derives every name from a custom namespace', () => {
    configureDataNamespace('vivexy-legal');
    expect(getConfigPath()).toBe(
      path.join(homeDir, '.vivexy-legal-config.json')
    );
    expect(getSkillsDir()).toBe(path.join(homeDir, '.vivexy-legal-skills'));
    expect(getChatIndexPath()).toBe(
      path.join(homeDir, '.vivexy-legal-chat-index.json')
    );

    setWorkspaceRoot(workspaceDir);
    expect(filesDir('chat-1')).toBe(
      path.join(workspaceDir, '.vivexy-legal', 'files', 'chat-1')
    );
  });

  it('rejects namespaces that could escape the home directory', () => {
    expect(() => configureDataNamespace('../evil')).toThrow();
    expect(() => configureDataNamespace('')).toThrow();
  });
});

describe('workspace containment', () => {
  it('accepts the root and paths inside it', () => {
    expect(isPathWithin('/ws/project', '/ws/project')).toBe(true);
    expect(isPathWithin('/ws/project', '/ws/project/a/b.txt')).toBe(true);
    expect(isPathWithin('/ws/project', '/ws/project/..notes')).toBe(true);
  });

  it('rejects siblings sharing the root as a prefix and traversal', () => {
    expect(isPathWithin('/ws/project', '/ws/project-evil/secret')).toBe(false);
    expect(isPathWithin('/ws/project', '/ws/projectX')).toBe(false);
    expect(isPathWithin('/ws/project', '/ws/project/../other')).toBe(false);
    expect(isPathWithin('/ws/project', '/etc/passwd')).toBe(false);
  });

  it('guards workspace and data-dir lookups', () => {
    setWorkspaceRoot(workspaceDir);
    const sibling = `${workspaceDir}-evil`;
    expect(() => assertWithinWorkspace(path.join(sibling, 'x'))).toThrow(
      /outside the workspace/
    );
    expect(assertWithinWorkspace('notes/a.md')).toBe(
      path.join(workspaceDir, 'notes', 'a.md')
    );
    expect(isDataPath(path.join(workspaceDir, '.vivexy', 'files'))).toBe(true);
    expect(isDataPath(path.join(workspaceDir, '.vivexy-other'))).toBe(false);
  });
});
