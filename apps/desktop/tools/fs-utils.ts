/**
 * Shared filesystem utilities for desktop tools.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Given a desired file path, return a path that doesn't collide with
 * an existing file. If the path is free, returns it unchanged.
 * Otherwise appends _v2, _v3, … before the extension.
 *
 * Example: report.xlsx → report_v2.xlsx → report_v3.xlsx
 */
export const nextAvailableName = (filePath: string): string => {
    if (!fs.existsSync(filePath)) return filePath;

    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);

    let version = 2;
    let candidate: string;
    do {
        candidate = path.join(dir, `${base}_v${version}${ext}`);
        version++;
    } while (fs.existsSync(candidate));

    return candidate;
};
