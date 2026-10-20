import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAllowedGit, runGit } from '../git';

let repoDir: string;
let markerPath: string;

beforeEach(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-git-'));
  markerPath = path.join(repoDir, 'pwned');
  execFileSync('git', ['init', '-q'], { cwd: repoDir });
});

afterEach(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
});

describe('runAllowedGit', () => {
  it('runs allowlisted subcommands', () => {
    expect(runAllowedGit(repoDir, ['status', '--short'])).toBe('');
    expect(runGit(repoDir, ['rev-parse', '--is-inside-work-tree'])).toBe(
      'true'
    );
  });

  it('rejects subcommands outside the allowlist', () => {
    const result = JSON.parse(
      runAllowedGit(repoDir, [`status; touch ${markerPath}`])
    );
    expect(result.error).toMatch(/not allowed/);
    expect(JSON.parse(runAllowedGit(repoDir, ['push'])).error).toMatch(
      /not allowed/
    );
    expect(fs.existsSync(markerPath)).toBe(false);
  });

  it('never interprets arguments through a shell', () => {
    const payloads = [
      `$(touch ${markerPath})`,
      `\`touch ${markerPath}\``,
      `"; touch ${markerPath}; echo "`,
      `x\\"; touch ${markerPath}; echo \\"`,
    ];
    for (const payload of payloads) {
      runAllowedGit(repoDir, ['status', payload]);
      runAllowedGit(repoDir, ['log', payload]);
    }
    expect(fs.existsSync(markerPath)).toBe(false);
  });
});
