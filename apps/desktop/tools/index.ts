/**
 * Tool Registry
 *
 * Maps tool names (as they appear in agent SSE events) to their
 * local executor functions. The IPC handler in main.ts uses this
 * registry to dispatch tool calls.
 */

import { createArtifact } from './artifact-tools';
import { readFile, analyzeData } from './file-tools';
import {
    listFiles,
    grepFiles,
    moveFile,
    copyFile,
    deleteFile,
    createDirectory,
    writeFile,
    updateFile,
    runCommand,
    gitStatus,
    gitLog,
    gitDiff,
    gitBranch,
    gitCheckout,
} from './fs-tools';

export type ToolExecutor = (input: Record<string, unknown>) => Promise<string>;

/**
 * Registry of client-executable tools.
 * Keys must match the tool names emitted by the agent-service.
 */
export const toolRegistry: Record<string, ToolExecutor> = {
    create_artifact: createArtifact,
    read_file: readFile,
    analyze_data: analyzeData,
    list_files: listFiles,
    grep_files: grepFiles,
    move_file: moveFile,
    copy_file: copyFile,
    delete_file: deleteFile,
    create_directory: createDirectory,
    write_file: writeFile,
    update_file: updateFile,
    run_command: runCommand,
    git_status: gitStatus,
    git_log: gitLog,
    git_diff: gitDiff,
    git_branch: gitBranch,
    git_checkout: gitCheckout,
};
