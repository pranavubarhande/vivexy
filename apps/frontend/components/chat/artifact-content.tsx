'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Artifact } from '@/services/chat.service';
import { cn } from '@/utils/common';
import dynamic from 'next/dynamic';

const MultiSheetEditor = dynamic(
  () => import('./multi-sheet-editor').then((mod) => mod.MultiSheetEditor),
  { ssr: false }
);

function parseCSV(content: string): string[][] {
  const lines = content.trim().split(/\r?\n/);
  return lines.map((line) => {
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if ((c === ',' && !inQuotes) || (c === '\t' && !inQuotes)) {
        row.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    row.push(current.trim());
    return row;
  });
}

export const ArtifactContent = ({ artifact }: { artifact: Artifact }) => {
  const type = (artifact.type || 'TXT').toUpperCase();
  const content = artifact.content ?? '';

  switch (type) {
    case 'MD':
    case 'MARKDOWN': {
      return (
        <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:bg-muted/80 prose-pre:rounded-lg prose-pre:py-2 prose-pre:px-3 prose-code:bg-muted/80 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-table:border-collapse">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-lg font-bold mb-3 mt-4 first:mt-0 border-b pb-1">
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-base font-semibold mb-2 mt-3">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-sm font-medium mb-2 mt-2">{children}</h3>
              ),
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => (
                <ul className="list-disc list-inside mb-2 space-y-0.5 ml-1">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside mb-2 space-y-0.5 ml-1">
                  {children}
                </ol>
              ),
              li: ({ children }) => <li className="ml-2">{children}</li>,
              strong: ({ children }) => (
                <strong className="font-semibold">{children}</strong>
              ),
              em: ({ children }) => <em className="italic">{children}</em>,
              code: ({ children }) => (
                <code className="bg-muted/80 px-1.5 py-0.5 rounded text-xs font-mono">
                  {children}
                </code>
              ),
              pre: ({ children }) => (
                <pre className="bg-muted/80 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2 border border-border/50">
                  {children}
                </pre>
              ),
              table: ({ children }) => (
                <div className="overflow-x-auto my-3 border border-border rounded-lg">
                  <table className="min-w-full text-sm border-collapse">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-muted/50">{children}</thead>
              ),
              tbody: ({ children }) => <tbody>{children}</tbody>,
              tr: ({ children }) => (
                <tr className="border-b border-border/50 last:border-b-0">
                  {children}
                </tr>
              ),
              th: ({ children }) => (
                <th className="text-left px-3 py-2 font-medium border-b border-border whitespace-nowrap">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="px-3 py-2 border-b border-border/30 whitespace-nowrap">
                  {children}
                </td>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      );
    }
    case 'HTML':
      return (
        <div
          className="artifact-html text-sm [&_table]:border [&_table]:border-border [&_th]:bg-muted/50 [&_td]:px-2 [&_td]:py-1"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      );
    case 'CSV': {
      const rows = parseCSV(content);
      if (rows.length === 0)
        return (
          <pre className="text-xs text-muted-foreground p-2">Empty CSV</pre>
        );
      const [header, ...dataRows] = rows;
      return (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                {header.map((cell, i) => (
                  <th
                    key={i}
                    className="text-left px-3 py-2 font-medium bg-muted/50 border-b border-border whitespace-nowrap"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-3 py-2 border-b border-border/50 whitespace-nowrap"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'PDF': {
      const isDataUrl =
        content.startsWith('data:application/pdf') ||
        (content.length > 100 &&
          /^[A-Za-z0-9+/=]+$/.test(content.slice(0, 200)));
      const src = isDataUrl
        ? content.startsWith('data:')
          ? content
          : `data:application/pdf;base64,${content}`
        : null;
      if (src) {
        return (
          <div className="w-full min-h-[360px] rounded-lg border border-border overflow-hidden bg-muted/30">
            <iframe
              src={src}
              title="PDF artifact"
              className="w-full h-[360px] border-0"
            />
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center text-sm text-muted-foreground">
          <p className="font-medium">PDF document</p>
          <p className="mt-1">
            Use the download button above to open this file.
          </p>
        </div>
      );
    }
    case 'XLSX': {
      const isCompiled = !!(
        artifact.metadata?.download_url || artifact.metadata?.downloadUrl
      );
      let parsedJson: string | null = null;

      try {
        if (content) {
          // Just verifying it parses
          JSON.parse(content);
          parsedJson = content;
        }
      } catch {
        // Not valid JSON
      }

      return (
        <div className="flex flex-col w-full relative h-[400px] border border-border/50 rounded-lg overflow-hidden my-2">
          {/* Output Header Status */}
          <div
            className={cn(
              'flex items-center justify-between px-4 py-2 text-xs border-b shrink-0',
              isCompiled
                ? 'bg-green-500/10 text-green-700 dark:text-green-500 border-green-500/20'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-500/20'
            )}
          >
            <div className="flex items-center gap-2 font-medium">
              {isCompiled ? (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  Spreadsheet Data
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  {parsedJson
                    ? 'Spreadsheet Data (Excel compilation pending...)'
                    : 'Processing background compilation...'}
                </>
              )}
            </div>

            {isCompiled && (
              <a
                href={
                  artifact.metadata.download_url ||
                  artifact.metadata.downloadUrl
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 bg-green-600 text-white hover:bg-green-700 px-3 py-1.5 rounded-md shadow-sm transition-colors text-[11px] font-semibold"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download .xlsx
              </a>
            )}
          </div>

          {/* Readonly Grid */}
          <div className="flex-1 min-h-0 relative">
            {parsedJson ? (
              <MultiSheetEditor jsonData={parsedJson} readonly={true} />
            ) : (
              <pre className="h-full bg-muted/80 p-3 text-xs font-mono overflow-auto whitespace-pre-wrap wrap-break-word custom-scrollbar">
                {content}
              </pre>
            )}
          </div>
        </div>
      );
    }
    case 'JSON': {
      let formatted = content;
      try {
        const parsed = JSON.parse(content);
        formatted =
          typeof parsed === 'object'
            ? JSON.stringify(parsed, null, 2)
            : content;
      } catch {
        // Use raw content when JSON parse fails
      }
      return (
        <pre className="bg-muted/80 p-3 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap wrap-break-word border border-border/50">
          {formatted}
        </pre>
      );
    }
    case 'JS':
    case 'TXT':
    default:
      return (
        <pre
          className={cn(
            'bg-muted/80 p-3 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap wrap-break-word border border-border/50',
            content.length > 2000 && 'max-h-[320px] overflow-y-auto'
          )}
        >
          {content}
        </pre>
      );
  }
};
