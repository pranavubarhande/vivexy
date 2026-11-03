'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@vivexy/ui/utils';
import { MERMAID_IFRAME } from '@vivexy/core/chat/artifact-content';
import type { Citation, CitationCheck } from '@vivexy/core/types/chat';
import { documentsService } from '@vivexy/core/services/documents.service';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@vivexy/ui/dialog';
import { AlertCircle, FileText, Loader2, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Remark plugin — turns [^hex8] text nodes into custom citation-ref nodes
// ---------------------------------------------------------------------------

const CITATION_PATTERN = /(\[\^([0-9a-f]{8})\])/g;

/** Replaces [^hex8] occurrences in text nodes with custom inline nodes. */
function remarkCitationRefs(idToNum: Map<string, number>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { visit } = require('unist-util-visit') as { visit: (tree: unknown, type: string, visitor: (node: unknown, idx: number, parent: unknown) => void) => void };
    visit(tree, 'text', (node: { type: string; value: string }, idx: number, parent: { children: unknown[] } | null) => {
      if (!parent || !node.value.includes('[^')) return;
      const parts: unknown[] = [];
      let lastIdx = 0;
      let match: RegExpExecArray | null;
      CITATION_PATTERN.lastIndex = 0;
      while ((match = CITATION_PATTERN.exec(node.value)) !== null) {
        if (match.index > lastIdx) {
          parts.push({ type: 'text', value: node.value.slice(lastIdx, match.index) });
        }
        const citId = match[2];
        const num = idToNum.get(citId) ?? null;
        if (num !== null) {
          parts.push({ type: 'citationRef', data: { citId, num } });
        } else {
          parts.push({ type: 'text', value: match[0] });
        }
        lastIdx = match.index + match[0].length;
      }
      if (lastIdx < node.value.length) {
        parts.push({ type: 'text', value: node.value.slice(lastIdx) });
      }
      if (parts.length > 1 || (parts.length === 1 && (parts[0] as { type: string }).type === 'citationRef')) {
        parent.children.splice(idx, 1, ...parts);
      }
    });
  };
}

// ---------------------------------------------------------------------------
// Source viewer dialog
// ---------------------------------------------------------------------------

interface SourceViewerProps {
  citation: Citation;
  onClose: () => void;
}

function SourceViewer({ citation, onClose }: SourceViewerProps) {
  const [pageText, setPageText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!citation.paginated) {
      setPageText(null);
      setLoading(false);
      return;
    }
    documentsService
      .getPage(citation.documentId, citation.pageNumber)
      .then((page) => {
        setPageText(page.text);
      })
      .catch((err: Error) => {
        setError(err.message || 'Could not load page');
      })
      .finally(() => setLoading(false));
  }, [citation]);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [pageText]);

  const highlightedContent = useMemo(() => {
    if (!pageText) return null;
    const { charStart, charEnd } = citation;
    if (charStart < 0 || charEnd <= charStart || charEnd > pageText.length) {
      return <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">{pageText}</pre>;
    }
    return (
      <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
        {pageText.slice(0, charStart)}
        <span
          ref={highlightRef}
          className="bg-yellow-200 dark:bg-yellow-800/60 rounded px-0.5"
        >
          {pageText.slice(charStart, charEnd)}
        </span>
        {pageText.slice(charEnd)}
      </pre>
    );
  }, [pageText, citation]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex flex-col gap-0 p-0 overflow-hidden max-w-3xl h-[80vh]">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="truncate pr-6 text-sm font-semibold">
            {citation.filename}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {citation.paginated ? `Page ${citation.pageNumber}` : 'Full document'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto min-h-0 p-4">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading page…
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          {!loading && !error && !citation.paginated && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Extracted quote:</p>
              <blockquote className="border-l-4 border-primary/40 pl-3 text-sm italic text-foreground/80">
                {citation.quote}
              </blockquote>
            </div>
          )}
          {highlightedContent}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Citation popover
// ---------------------------------------------------------------------------

interface CitationPopoverProps {
  citation: Citation;
  num: number;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onViewSource: () => void;
}

function CitationPopover({ citation, num, anchorRef, onClose, onViewSource }: CitationPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [anchorRef, onClose]);

  return (
    <div
      ref={popoverRef}
      className={cn(
        'absolute z-50 bottom-full left-0 mb-2 w-72',
        'rounded-xl border border-border/60 bg-popover shadow-lg',
        'p-3 space-y-2 text-xs'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-foreground leading-tight">
          [{num}] {citation.filename}
        </span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {citation.paginated && (
        <p className="text-muted-foreground">Page {citation.pageNumber}</p>
      )}
      {citation.quote && (
        <blockquote className="border-l-2 border-primary/40 pl-2 italic text-foreground/70 line-clamp-4">
          {citation.quote}
        </blockquote>
      )}
      {citation.paginated && (
        <button
          onClick={onViewSource}
          className="flex items-center gap-1 text-primary hover:underline text-xs font-medium"
        >
          <FileText className="h-3 w-3" />
          View in document
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline citation marker (superscript button)
// ---------------------------------------------------------------------------

interface CitationMarkerProps {
  citId: string;
  num: number;
  citation: Citation;
}

function CitationMarker({ citId, num, citation }: CitationMarkerProps) {
  const [open, setOpen] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  return (
    <span className="relative inline-block">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center justify-center',
          'text-[10px] font-semibold leading-none',
          'px-1 py-0.5 rounded',
          'bg-primary/10 text-primary hover:bg-primary/20 transition-colors',
          'align-super ml-0.5 cursor-pointer select-none'
        )}
        aria-label={`Citation ${num}: ${citation.filename}`}
        data-citation-id={citId}
      >
        {num}
      </button>
      {open && (
        <CitationPopover
          citation={citation}
          num={num}
          anchorRef={btnRef}
          onClose={() => setOpen(false)}
          onViewSource={() => {
            setOpen(false);
            setShowSource(true);
          }}
        />
      )}
      {showSource && (
        <SourceViewer citation={citation} onClose={() => setShowSource(false)} />
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Citation-aware message stream
// ---------------------------------------------------------------------------

interface CitationMessageStreamProps {
  content: string;
  isStreaming?: boolean;
  citations: Citation[];
  className?: string;
}

export function CitationMessageStream({
  content,
  isStreaming,
  citations,
  className,
}: CitationMessageStreamProps) {
  const citationMap = useMemo(() => {
    const map = new Map<string, Citation>();
    citations.forEach((c) => map.set(c.id, c));
    return map;
  }, [citations]);

  const idToNum = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, number>();
    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    const re = /\[\^([0-9a-f]{8})\]/g;
    while ((match = re.exec(content)) !== null) {
      const id = match[1];
      if (!seen.has(id) && citationMap.has(id)) {
        seen.add(id);
        order.push(id);
        map.set(id, order.length);
      }
    }
    return map;
  }, [content, citationMap]);

  const remarkPlugin = useMemo(
    () => remarkCitationRefs(idToNum),
    [idToNum]
  );

  return (
    <div
      className={cn(
        'prose prose-sm max-w-none dark:prose-invert py-2',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkPlugin]}
        components={{
          // @ts-expect-error custom MDAST node rendered via components map
          citationRef: ({ node }: { node: { data: { citId: string; num: number } } }) => {
            const { citId, num } = node.data;
            const citation = citationMap.get(citId);
            if (!citation) return <sup>[{num}]</sup>;
            return <CitationMarker citId={citId} num={num} citation={citation} />;
          },
          h1: ({ children }) => <h1 className="text-lg font-bold mb-3 mt-4 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold mb-2 mt-3">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-medium mb-2 mt-2">{children}</h3>,
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="ml-2">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ className: cls, children, ...props }) => {
            if (cls === 'language-mermaid') {
              return (
                <iframe
                  srcDoc={MERMAID_IFRAME(String(children))}
                  sandbox="allow-scripts"
                  className="w-full rounded-lg border border-border my-2"
                  style={{ height: '320px' }}
                  title="Diagram"
                />
              );
            }
            const isInline = !cls;
            if (isInline) {
              return <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
            }
            return <code className={cn('text-xs', cls)} {...props}>{children}</code>;
          },
          pre: ({ children }) => (
            <pre className="bg-muted p-3 rounded-lg text-xs font-mono overflow-x-auto mb-2 whitespace-pre-wrap">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-2">
              <table className="min-w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-muted-foreground/20 px-3 py-2 bg-muted text-left font-medium">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-muted-foreground/20 px-3 py-2">{children}</td>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-ink hover:underline">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground my-2">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-4 bg-primary animate-pulse" />
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Citation check banner (unsupported sentences)
// ---------------------------------------------------------------------------

interface CitationCheckBannerProps {
  citationCheck: CitationCheck;
}

function CitationCheckBanner({ citationCheck }: CitationCheckBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (citationCheck.unsupportedCount === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-700/40 p-3 text-xs space-y-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400 w-full text-left"
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {citationCheck.unsupportedCount} statement
        {citationCheck.unsupportedCount !== 1 ? 's' : ''} could not be verified
        <span className="ml-auto text-[10px] text-amber-600/70 dark:text-amber-500/70">
          {expanded ? 'Hide' : 'Show'}
        </span>
      </button>
      {expanded && (
        <ul className="space-y-1.5">
          {citationCheck.statements
            .filter((s) => !s.supported)
            .map((s, i) => (
              <li key={i} className="text-amber-800 dark:text-amber-300/80 leading-snug">
                <span className="font-medium">"{s.text}"</span>
                {s.reason && (
                  <span className="text-amber-700/70 dark:text-amber-500/60 ml-1">
                    — {s.reason}
                  </span>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Citation footnotes list (numbered references below message)
// ---------------------------------------------------------------------------

interface CitationFootnotesProps {
  citations: Citation[];
  citationCheck?: CitationCheck | null;
  content: string;
}

export function CitationFootnotes({
  citations,
  citationCheck,
  content,
}: CitationFootnotesProps) {
  const [sourceFor, setSourceFor] = useState<Citation | null>(null);

  // Build ordered list: citations in order of first appearance in content
  const ordered = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ citation: Citation; num: number }> = [];
    const re = /\[\^([0-9a-f]{8})\]/g;
    const citMap = new Map(citations.map((c) => [c.id, c]));
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const id = match[1];
      if (!seen.has(id) && citMap.has(id)) {
        seen.add(id);
        result.push({ citation: citMap.get(id)!, num: result.length + 1 });
      }
    }
    // Append any citations not referenced in text
    for (const c of citations) {
      if (!seen.has(c.id)) {
        result.push({ citation: c, num: result.length + 1 });
      }
    }
    return result;
  }, [citations, content]);

  if (ordered.length === 0 && !citationCheck?.unsupportedCount) return null;

  return (
    <div className="mt-4 space-y-1">
      {citationCheck && <CitationCheckBanner citationCheck={citationCheck} />}
      {ordered.length > 0 && (
        <div className="border-t border-border/40 pt-3 space-y-1">
          {ordered.map(({ citation, num }) => (
            <div key={citation.id} className="flex items-start gap-2 group/fn text-xs">
              <span className="text-muted-foreground font-medium shrink-0 w-5 text-right">
                [{num}]
              </span>
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => setSourceFor(citation)}
                  className="text-muted-foreground hover:text-foreground transition-colors text-left truncate max-w-full inline-flex items-center gap-1"
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="truncate">{citation.filename}</span>
                  {citation.paginated && (
                    <span className="text-muted-foreground/60 shrink-0">p.{citation.pageNumber}</span>
                  )}
                </button>
                {citation.quote && (
                  <p className="text-muted-foreground/60 line-clamp-1 mt-0.5 italic">
                    "{citation.quote}"
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {sourceFor && (
        <SourceViewer citation={sourceFor} onClose={() => setSourceFor(null)} />
      )}
    </div>
  );
}
