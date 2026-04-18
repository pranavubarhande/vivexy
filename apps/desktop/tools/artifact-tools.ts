/**
 * Client-side artifact creation tool.
 *
 * By default, saves generated files directly into the workspace root so
 * the user can find them alongside their project files. If the agent
 * supplies an explicit `output_path`, we honour it (within workspace).
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    getWorkspaceRoot,
    assertWithinWorkspace,
    appendManifest,
} from './paths';
import { nextAvailableName } from './fs-utils';

const generateId = (): string => {
    const { randomUUID } = require('crypto');
    return randomUUID();
};

interface ArtifactInput {
    chat_id?: string;
    title?: string;
    type?: string;
    filename?: string;
    language?: string;
    content: string;
    output_path?: string;
}

export const createArtifact = async (
    input: Record<string, unknown>
): Promise<string> => {
    try {
        const data = input as unknown as ArtifactInput;
        const chatId = (data.chat_id as string) || 'default';
        const artifactType = ((data.type as string) || 'MD').toUpperCase();
        const title = data.title || data.filename || 'Untitled';
        const content = data.content || '';

        let ext: string;
        switch (artifactType) {
            case 'CSV':
                ext = '.csv';
                break;
            case 'XLSX':
                ext = '.xlsx';
                break;
            default:
                ext = '.md';
        }

        const baseFilename = data.filename || `${title}${ext}`;
        const safeFilename = baseFilename.replace(/[^a-zA-Z0-9._\- ]/g, '_');

        // Determine output directory: explicit output_path, or workspace root
        let dir: string;
        if (data.output_path) {
            dir = assertWithinWorkspace(data.output_path);
            fs.mkdirSync(dir, { recursive: true });
        } else {
            const root = getWorkspaceRoot();
            if (!root) throw new Error('No workspace selected');
            dir = root;
        }

        const desiredPath = path.join(dir, safeFilename);
        assertWithinWorkspace(desiredPath);
        const filePath = nextAvailableName(desiredPath);
        const actualFilename = path.basename(filePath);

        if (artifactType === 'XLSX') {
            try {
                const XLSX = require('xlsx');
                const sheetsData = JSON.parse(content);
                const workbook = XLSX.utils.book_new();

                if (
                    typeof sheetsData === 'object' &&
                    !Array.isArray(sheetsData)
                ) {
                    for (const [sheetName, rows] of Object.entries(
                        sheetsData
                    )) {
                        const ws = XLSX.utils.json_to_sheet(rows as object[]);
                        XLSX.utils.book_append_sheet(workbook, ws, sheetName);
                    }
                } else if (Array.isArray(sheetsData)) {
                    const ws = XLSX.utils.json_to_sheet(sheetsData);
                    XLSX.utils.book_append_sheet(workbook, ws, 'Sheet1');
                }

                XLSX.writeFile(workbook, filePath);
            } catch {
                fs.writeFileSync(filePath, content, 'utf-8');
            }
        } else {
            fs.writeFileSync(filePath, content, 'utf-8');
        }

        const artifactId = generateId();
        const now = new Date().toISOString();

        appendManifest(chatId, {
            id: artifactId,
            chatId,
            title,
            filename: actualFilename,
            type: artifactType,
            localPath: filePath,
            createdAt: now,
            language: data.language || null,
        });

        return JSON.stringify({
            success: true,
            artifact: {
                id: artifactId,
                chatId,
                title,
                type: artifactType,
                filename: actualFilename,
                language: data.language || null,
                content,
                seq: 1,
                metadata: { localPath: filePath },
                createdAt: now,
            },
        });
    } catch (err) {
        return JSON.stringify({
            success: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
};
