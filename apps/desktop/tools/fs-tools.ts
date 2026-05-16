/**
 * Filesystem tools for the desktop agent.
 *
 * Every operation is sandboxed to the workspace root via assertWithinWorkspace.
 * The agent can list, search, move, copy, delete files and create directories.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot, assertWithinWorkspace } from './paths';
import { nextAvailableName } from './fs-utils';

// ── list_files ───────────────────────────────────────────────────────

interface ListFilesInput {
    directory?: string;
    recursive?: boolean;
    pattern?: string;
}

const walkDir = (
    dir: string,
    root: string,
    recursive: boolean,
    pattern: RegExp | null,
    results: Array<{ name: string; path: string; type: string; size: number }>,
    depth: number = 0
): void => {
    if (depth > 8) return;
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(root, fullPath);
        const isDir = entry.isDirectory();

        if (!pattern || pattern.test(entry.name)) {
            try {
                const stat = fs.statSync(fullPath);
                results.push({
                    name: entry.name,
                    path: relPath,
                    type: isDir ? 'directory' : 'file',
                    size: stat.size,
                });
            } catch {
                /* stat failed */
            }
        }

        if (isDir && recursive) {
            walkDir(fullPath, root, recursive, pattern, results, depth + 1);
        }
    }
};

export const listFiles = async (
    input: Record<string, unknown>
): Promise<string> => {
    try {
        const data = input as unknown as ListFilesInput;
        const root = getWorkspaceRoot();
        if (!root) throw new Error('No workspace selected');

        const dir = data.directory
            ? assertWithinWorkspace(data.directory)
            : root;

        let pattern: RegExp | null = null;
        if (data.pattern) {
            try {
                const globToRegex = data.pattern
                    .replace(/\./g, '\\.')
                    .replace(/\*/g, '.*')
                    .replace(/\?/g, '.');
                pattern = new RegExp(globToRegex, 'i');
            } catch {
                /* invalid pattern, list all */
            }
        }

        const results: Array<{
            name: string;
            path: string;
            type: string;
            size: number;
        }> = [];
        walkDir(dir, root, data.recursive ?? false, pattern, results);

        if (results.length > 200) {
            return JSON.stringify({
                success: true,
                files: results.slice(0, 200),
                total: results.length,
                truncated: true,
            });
        }

        return JSON.stringify({
            success: true,
            files: results,
            total: results.length,
        });
    } catch (err) {
        return JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
};

// ── grep_files ───────────────────────────────────────────────────────

interface GrepFilesInput {
    pattern: string;
    directory?: string;
    file_pattern?: string;
    case_sensitive?: boolean;
    max_results?: number;
}

const BINARY_EXTENSIONS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.bmp',
    '.ico',
    '.svg',
    '.pdf',
    '.zip',
    '.gz',
    '.tar',
    '.rar',
    '.7z',
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.xlsx',
    '.xls',
    '.docx',
    '.pptx',
    '.mp3',
    '.mp4',
    '.avi',
    '.mov',
    '.wav',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.db',
    '.sqlite',
]);

export const grepFiles = async (
    input: Record<string, unknown>
): Promise<string> => {
    try {
        const data = input as unknown as GrepFilesInput;
        const root = getWorkspaceRoot();
        if (!root) throw new Error('No workspace selected');

        const dir = data.directory
            ? assertWithinWorkspace(data.directory)
            : root;

        const flags = data.case_sensitive ? 'g' : 'gi';
        const regex = new RegExp(data.pattern, flags);
        const maxResults = Math.min(data.max_results || 50, 100);

        let filePattern: RegExp | null = null;
        if (data.file_pattern) {
            try {
                const fp = data.file_pattern
                    .replace(/\./g, '\\.')
                    .replace(/\*/g, '.*')
                    .replace(/\?/g, '.');
                filePattern = new RegExp(fp, 'i');
            } catch {
                /* ignore */
            }
        }

        const matches: Array<{
            file: string;
            line: number;
            content: string;
        }> = [];

        const searchDir = (d: string, depth: number): void => {
            if (depth > 8 || matches.length >= maxResults) return;
            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(d, { withFileTypes: true });
            } catch {
                return;
            }
            for (const entry of entries) {
                if (matches.length >= maxResults) break;
                if (entry.name.startsWith('.') || entry.name === 'node_modules')
                    continue;

                const fullPath = path.join(d, entry.name);
                if (entry.isDirectory()) {
                    searchDir(fullPath, depth + 1);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (BINARY_EXTENSIONS.has(ext)) continue;
                    if (filePattern && !filePattern.test(entry.name)) continue;

                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.size > 1_000_000) continue;
                    } catch {
                        continue;
                    }

                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        const lines = content.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            if (matches.length >= maxResults) break;
                            if (regex.test(lines[i])) {
                                matches.push({
                                    file: path.relative(root, fullPath),
                                    line: i + 1,
                                    content: lines[i].trim().substring(0, 200),
                                });
                            }
                            regex.lastIndex = 0;
                        }
                    } catch {
                        /* read error */
                    }
                }
            }
        };

        searchDir(dir, 0);

        return JSON.stringify({
            success: true,
            matches,
            total: matches.length,
            truncated: matches.length >= maxResults,
        });
    } catch (err) {
        return JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
};

// ── move_file ────────────────────────────────────────────────────────

interface MoveFileInput {
    source: string;
    destination: string;
}

export const moveFile = async (
    input: Record<string, unknown>
): Promise<string> => {
    try {
        const data = input as unknown as MoveFileInput;
        const src = assertWithinWorkspace(data.source);
        const dest = assertWithinWorkspace(data.destination);

        if (!fs.existsSync(src)) {
            return JSON.stringify({
                success: false,
                error: `Source not found: ${data.source}`,
            });
        }

        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(src, dest);

        const root = getWorkspaceRoot()!;
        return JSON.stringify({
            success: true,
            source: path.relative(root, src),
            destination: path.relative(root, dest),
        });
    } catch (err) {
        return JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
};

// ── copy_file ────────────────────────────────────────────────────────

interface CopyFileInput {
    source: string;
    destination: string;
}

export const copyFile = async (
    input: Record<string, unknown>
): Promise<string> => {
    try {
        const data = input as unknown as CopyFileInput;
        const src = assertWithinWorkspace(data.source);
        const dest = assertWithinWorkspace(data.destination);

        if (!fs.existsSync(src)) {
            return JSON.stringify({
                success: false,
                error: `Source not found: ${data.source}`,
            });
        }

        fs.mkdirSync(path.dirname(dest), { recursive: true });

        const srcStat = fs.statSync(src);
        if (srcStat.isDirectory()) {
            fs.cpSync(src, dest, { recursive: true });
        } else {
            fs.copyFileSync(src, dest);
        }

        const root = getWorkspaceRoot()!;
        return JSON.stringify({
            success: true,
            source: path.relative(root, src),
            destination: path.relative(root, dest),
        });
    } catch (err) {
        return JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
};

// ── delete_file ──────────────────────────────────────────────────────

interface DeleteFileInput {
    filepath: string;
}

export const deleteFile = async (
    input: Record<string, unknown>
): Promise<string> => {
    try {
        const data = input as unknown as DeleteFileInput;
        const resolved = assertWithinWorkspace(data.filepath);

        if (!fs.existsSync(resolved)) {
            return JSON.stringify({
                success: false,
                error: `Not found: ${data.filepath}`,
            });
        }

        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
            fs.rmSync(resolved, { recursive: true, force: true });
        } else {
            fs.unlinkSync(resolved);
        }

        const root = getWorkspaceRoot()!;
        return JSON.stringify({
            success: true,
            deleted: path.relative(root, resolved),
        });
    } catch (err) {
        return JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
};

// ── create_directory ─────────────────────────────────────────────────

interface CreateDirectoryInput {
    directory: string;
}

export const createDirectory = async (
    input: Record<string, unknown>
): Promise<string> => {
    try {
        const data = input as unknown as CreateDirectoryInput;
        const resolved = assertWithinWorkspace(data.directory);

        fs.mkdirSync(resolved, { recursive: true });

        const root = getWorkspaceRoot()!;
        return JSON.stringify({
            success: true,
            directory: path.relative(root, resolved),
        });
    } catch (err) {
        return JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
};

// ── write_file ───────────────────────────────────────────────────────

interface WriteFileInput {
    filepath: string;
    content: string;
    create_dirs?: boolean;
    overwrite?: boolean;
}

export const writeFile = async (
    input: Record<string, unknown>
): Promise<string> => {
    try {
        const data = input as unknown as WriteFileInput;
        let resolved = assertWithinWorkspace(data.filepath);

        if (data.create_dirs !== false) {
            fs.mkdirSync(path.dirname(resolved), { recursive: true });
        }

        if (!data.overwrite) {
            resolved = nextAvailableName(resolved);
        }

        fs.writeFileSync(resolved, data.content, 'utf-8');

        const root = getWorkspaceRoot()!;
        return JSON.stringify({
            success: true,
            filepath: path.relative(root, resolved),
            size: Buffer.byteLength(data.content, 'utf-8'),
        });
    } catch (err) {
        return JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
};

// ── update_file ──────────────────────────────────────────────────────

interface UpdateFileInput {
    filepath: string;
    content?: string;
    find?: string;
    replace?: string;
    append?: string;
    prepend?: string;
}

export const updateFile = async (
    input: Record<string, unknown>
): Promise<string> => {
    try {
        const data = input as unknown as UpdateFileInput;
        const resolved = assertWithinWorkspace(data.filepath);

        if (!fs.existsSync(resolved)) {
            return JSON.stringify({
                success: false,
                error: `File not found: ${data.filepath}`,
            });
        }

        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
            return JSON.stringify({
                success: false,
                error: 'Cannot update a directory',
            });
        }

        if (data.content !== undefined) {
            fs.writeFileSync(resolved, data.content, 'utf-8');
        } else {
            let existing = fs.readFileSync(resolved, 'utf-8');
            if (data.find !== undefined && data.replace !== undefined) {
                if (!existing.includes(data.find)) {
                    return JSON.stringify({
                        success: false,
                        error: 'Find string not found in file',
                    });
                }
                existing = existing.replace(data.find, data.replace);
            }
            if (data.prepend) {
                existing = data.prepend + existing;
            }
            if (data.append) {
                existing = existing + data.append;
            }
            fs.writeFileSync(resolved, existing, 'utf-8');
        }

        const root = getWorkspaceRoot()!;
        return JSON.stringify({
            success: true,
            filepath: path.relative(root, resolved),
            size: fs.statSync(resolved).size,
        });
    } catch (err) {
        return JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
};

// ── run_command ──────────────────────────────────────────────────────

interface RunCommandInput {
    command: string;
    cwd?: string;
    timeout_ms?: number;
}

export const runCommand = async (
    input: Record<string, unknown>
): Promise<string> => {
    const data = input as unknown as RunCommandInput;
    const root = getWorkspaceRoot();
    if (!root) return JSON.stringify({ success: false, error: 'No workspace selected' });

    const workDir = data.cwd ? assertWithinWorkspace(data.cwd) : root;
    const timeoutMs = Math.min(data.timeout_ms ?? 30_000, 120_000);

    try {
        const stdout = execSync(data.command, {
            cwd: workDir,
            timeout: timeoutMs,
            encoding: 'utf-8',
            stdio: 'pipe',
            maxBuffer: 10 * 1024 * 1024,
        });
        return JSON.stringify({ success: true, output: stdout.toString().trim() });
    } catch (err: unknown) {
        const e = err as { message?: string; stdout?: Buffer; stderr?: Buffer };
        return JSON.stringify({
            success: false,
            error: e.message ?? String(err),
            stdout: e.stdout?.toString().trim() ?? '',
            stderr: e.stderr?.toString().trim() ?? '',
        });
    }
};

// ── git tools ────────────────────────────────────────────────────────

function gitExec(args: string[]): string {
    const root = getWorkspaceRoot();
    if (!root) return JSON.stringify({ error: 'No workspace set' });
    return execSync(
        `git ${args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(' ')}`,
        { cwd: root, stdio: 'pipe', timeout: 10_000 }
    )
        .toString()
        .trim();
}

export const gitStatus = async (
    _input: Record<string, unknown>
): Promise<string> => {
    try {
        return gitExec(['status', '--short', '--branch']);
    } catch (err) {
        return JSON.stringify({ error: String(err) });
    }
};

export const gitLog = async (
    input: Record<string, unknown>
): Promise<string> => {
    try {
        const n = Number(input.n ?? 20);
        const args = ['log', '--oneline', `--max-count=${n}`];
        if (input.branch) args.push(String(input.branch));
        return gitExec(args);
    } catch (err) {
        return JSON.stringify({ error: String(err) });
    }
};

export const gitDiff = async (
    input: Record<string, unknown>
): Promise<string> => {
    try {
        const args = ['diff'];
        if (input.ref) args.push(String(input.ref));
        if (input.filepath) args.push('--', String(input.filepath));
        const out = gitExec(args);
        return out.length > 8000 ? out.slice(0, 8000) + '\n… (truncated)' : out;
    } catch (err) {
        return JSON.stringify({ error: String(err) });
    }
};

export const gitBranch = async (
    input: Record<string, unknown>
): Promise<string> => {
    try {
        const args = input.all ? ['branch', '-a'] : ['branch'];
        return gitExec(args);
    } catch (err) {
        return JSON.stringify({ error: String(err) });
    }
};

export const gitCheckout = async (
    input: Record<string, unknown>
): Promise<string> => {
    try {
        const branch = String(input.branch ?? '');
        if (!branch) return JSON.stringify({ error: 'branch is required' });
        const args = input.create
            ? ['checkout', '-b', branch]
            : ['checkout', branch];
        return gitExec(args);
    } catch (err) {
        return JSON.stringify({ error: String(err) });
    }
};
