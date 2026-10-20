import { execFileSync } from 'child_process';
import * as path from 'path';

export const SAFE_GIT_SUBCOMMANDS = new Set([
  'status',
  'log',
  'diff',
  'branch',
  'show',
  'blame',
  'checkout',
  'ls-tree',
]);

/** Run git with an argument array (no shell), returning trimmed stdout. */
export const runGit = (cwd: string, args: string[]): string =>
  execFileSync('git', args, { cwd, stdio: 'pipe', timeout: 10_000 })
    .toString()
    .trim();

/**
 * Run a renderer-requested git command, allowing only SAFE_GIT_SUBCOMMANDS.
 * Errors are returned as a JSON string, matching the IPC contract.
 */
export const runAllowedGit = (cwd: string, args: string[]): string => {
  if (!args.length || !SAFE_GIT_SUBCOMMANDS.has(args[0])) {
    return JSON.stringify({
      error: `Git subcommand '${args[0]}' not allowed`,
    });
  }
  try {
    return runGit(cwd, args);
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
};

export const detectRepoAt = (dir: string): Record<string, unknown> | null => {
  try {
    runGit(dir, ['rev-parse', '--git-dir']);
    const branch = runGit(dir, ['branch', '--show-current']);
    let remote = '';
    try {
      remote = runGit(dir, ['remote', 'get-url', 'origin']);
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
};
