/**
 * Client-side file tools.
 *
 * Reads and analyzes files from the local filesystem instead of S3.
 * Uploaded files live in the workspace data dir: .{namespace}/files/{chatId}/.
 */

import * as fs from 'fs';
import * as path from 'path';
import { filesDir, getWorkspaceRoot, assertWithinWorkspace } from './paths';

interface ReadFileInput {
  chat_id?: string;
  filename: string;
  filepath?: string;
}

interface AnalyzeDataInput {
  chat_id?: string;
  filename: string;
  filepath?: string;
}

/**
 * Find a file - first check chat's files dir, then search workspace.
 * All paths are validated to stay within the workspace root.
 */
const findFile = (
  chatId: string,
  filename: string,
  filepath?: string
): string | null => {
  if (filepath) {
    try {
      const resolved = assertWithinWorkspace(filepath);
      if (fs.existsSync(resolved)) return resolved;
    } catch {
      /* path outside workspace, fall through */
    }
  }

  const dir = filesDir(chatId);
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    const match = files.find((f) =>
      f.toLowerCase().includes(filename.toLowerCase())
    );
    if (match) return path.join(dir, match);
  }

  // Search workspace root (non-recursive, top level only)
  const root = getWorkspaceRoot();
  if (root) {
    try {
      const entries = fs.readdirSync(root);
      const match = entries.find((f) =>
        f.toLowerCase().includes(filename.toLowerCase())
      );
      if (match) return path.join(root, match);
    } catch {
      /* permission error or similar */
    }
  }

  return null;
};

/**
 * Detect file type from extension.
 */
const detectFileType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  const typeMap: Record<string, string> = {
    '.csv': 'csv',
    '.xlsx': 'xlsx',
    '.xls': 'xlsx',
    '.pdf': 'pdf',
    '.docx': 'docx',
    '.md': 'markdown',
    '.txt': 'text',
    '.json': 'json',
  };
  return typeMap[ext] || 'text';
};

/**
 * Read a file from the chat's local files directory.
 * Mirrors the server-side read_file_func behavior.
 */
export const readFile = async (
  input: Record<string, unknown>
): Promise<string> => {
  try {
    const data = input as unknown as ReadFileInput;
    const chatId = (data as { chat_id?: string }).chat_id || 'default';

    const filePath = findFile(chatId, data.filename, data.filepath);
    if (!filePath) {
      return JSON.stringify({
        success: false,
        error: `File '${data.filename}' not found in chat files`,
      });
    }

    const fileType = detectFileType(filePath);
    let content = '';
    let metadata: Record<string, unknown> = {};

    switch (fileType) {
      case 'csv': {
        content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter((l) => l.trim());
        metadata = {
          shape: [lines.length - 1, lines[0]?.split(',').length || 0],
          columns: lines[0]?.split(',').map((c) => c.trim()) || [],
        };
        break;
      }

      case 'xlsx': {
        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        content = JSON.stringify(jsonData, null, 2);
        metadata = {
          sheets: workbook.SheetNames,
          shape: [jsonData.length, Object.keys(jsonData[0] || {}).length],
          columns: Object.keys(jsonData[0] || {}),
        };
        break;
      }

      case 'pdf': {
        const pdfParse = require('pdf-parse');
        const buffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(buffer);
        content = pdfData.text;
        metadata = { pages: pdfData.numpages };
        break;
      }

      default: {
        content = fs.readFileSync(filePath, 'utf-8');
        break;
      }
    }

    // Truncate long content
    if (content.length > 5000) {
      content =
        content.substring(0, 5000) +
        '\n... [Content truncated, use analyze_data for full analysis]';
    }

    return JSON.stringify({
      success: true,
      filename: path.basename(filePath),
      type: fileType,
      content,
      metadata,
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

/**
 * Analyze data from a CSV or XLSX file.
 * Computes basic statistics (row count, column info, missing values).
 */
export const analyzeData = async (
  input: Record<string, unknown>
): Promise<string> => {
  try {
    const data = input as unknown as AnalyzeDataInput;
    const chatId = (data as { chat_id?: string }).chat_id || 'default';

    const filePath = findFile(chatId, data.filename, data.filepath);
    if (!filePath) {
      return JSON.stringify({
        success: false,
        error: `File '${data.filename}' not found in chat files`,
      });
    }

    const fileType = detectFileType(filePath);
    if (fileType !== 'csv' && fileType !== 'xlsx') {
      return JSON.stringify({
        success: false,
        error: 'analyze_data only supports CSV and XLSX files',
      });
    }

    let rows: Record<string, unknown>[] = [];
    let columns: string[] = [];

    if (fileType === 'csv') {
      const csvContent = fs.readFileSync(filePath, 'utf-8');
      const lines = csvContent.split('\n').filter((l) => l.trim());
      if (lines.length > 0) {
        columns = lines[0].split(',').map((c) => c.trim());
        rows = lines.slice(1).map((line) => {
          const values = line.split(',');
          const obj: Record<string, unknown> = {};
          columns.forEach((col, i) => {
            obj[col] = values[i]?.trim() || null;
          });
          return obj;
        });
      }
    } else {
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet);
      if (rows.length > 0) {
        columns = Object.keys(rows[0]);
      }
    }

    // Compute statistics per column
    const columnStats = columns.map((col) => {
      const values = rows.map((r) => r[col]);
      const nonNull = values.filter(
        (v) => v !== null && v !== undefined && v !== ''
      );
      const numericValues = nonNull.map(Number).filter((n) => !isNaN(n));

      const stats: Record<string, unknown> = {
        column: col,
        total: values.length,
        nonNull: nonNull.length,
        missing: values.length - nonNull.length,
        uniqueValues: new Set(nonNull.map(String)).size,
      };

      if (numericValues.length > 0) {
        const sorted = [...numericValues].sort((a, b) => a - b);
        stats.min = sorted[0];
        stats.max = sorted[sorted.length - 1];
        stats.mean =
          numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
        stats.median = sorted[Math.floor(sorted.length / 2)];
        stats.isNumeric = true;
      } else {
        stats.isNumeric = false;
        stats.sampleValues = nonNull.slice(0, 5).map(String);
      }

      return stats;
    });

    return JSON.stringify({
      success: true,
      filename: path.basename(filePath),
      shape: [rows.length, columns.length],
      columns,
      columnStats,
      sampleRows: rows.slice(0, 5),
    });
  } catch (err) {
    return JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
