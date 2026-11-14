'use client';

import { ReactNode, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@vivexy/ui/utils';
import { citedSources, numberCitations } from '../../lib/citations';
import type { Citation, CitationCheck, Message } from '../../types/chat';
import { CitationContext, CitationContextValue } from './citation-context';
import { formatCitationLocation } from './citation-marker';
import { CitationSourceViewer } from './citation-source-viewer';

const CitationCheckSummary = ({ check }: { check: CitationCheck }) => {
  const [expanded, setExpanded] = useState(false);
  const unsupported = check.statements.filter(
    (statement) => !statement.supported
  );
  const unknownCount = check.unknownCitationIds.length;
  const total = check.statements.length;

  if (unsupported.length === 0 && unknownCount === 0) {
    return (
      <p
        data-testid="citation-check-summary"
        className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"
      >
        <ShieldCheck className="size-3.5" />
        {total === 1
          ? 'The cited statement is supported by its source.'
          : `All ${total} cited statements are supported by their sources.`}
      </p>
    );
  }

  const problems = [
    unsupported.length > 0 &&
      `${unsupported.length} of ${total} cited statement${total === 1 ? '' : 's'} may not be supported by ${total === 1 ? 'its source' : 'their sources'}`,
    unknownCount > 0 &&
      `${unknownCount} citation${unknownCount === 1 ? '' : 's'} match${unknownCount === 1 ? 'es' : ''} no source`,
  ].filter(Boolean);

  return (
    <div
      data-testid="citation-check-summary"
      className="rounded-lg border border-amber-500/40 bg-amber-500/5 text-xs"
    >
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left font-medium text-amber-900 dark:text-amber-200"
      >
        <AlertTriangle className="size-3.5 shrink-0" />
        <span className="flex-1">
          {problems.join(' · ')}. Check before relying on them.
        </span>
        <ChevronDown
          className={cn(
            'size-3.5 transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>
      {expanded && (
        <ul className="space-y-2 border-t border-amber-500/30 px-3 py-2">
          {unsupported.map((statement, index) => (
            <li key={index}>
              <p className="text-foreground">&ldquo;{statement.text}&rdquo;</p>
              <p className="text-muted-foreground">{statement.reason}</p>
            </li>
          ))}
          {unknownCount > 0 && (
            <li className="text-muted-foreground">
              Markers shown as{' '}
              <span className="font-semibold text-destructive">?</span> cite a
              passage the assistant never retrieved.
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

const SourcesList = ({
  sources,
  onOpen,
}: {
  sources: Citation[];
  onOpen: (citation: Citation) => void;
}) => (
  <div data-testid="citation-sources" className="space-y-1">
    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      Sources
    </p>
    <ol className="space-y-0.5">
      {sources.map((source, index) => (
        <li key={source.id}>
          <button
            type="button"
            onClick={() => onOpen(source)}
            className="group/source flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted"
          >
            <span className="mt-px inline-flex h-4 min-w-4 items-center justify-center rounded bg-secondary px-1 text-[10px] font-semibold text-foreground ring-1 ring-border">
              {index + 1}
            </span>
            <FileText className="mt-px size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">
                {formatCitationLocation(source)}
              </span>
              <span className="block truncate text-muted-foreground">
                {source.quote}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  </div>
);

interface MessageCitationsProps {
  message: Message;
  children: ReactNode;
}

/** Provides footnote numbering to the markdown inside an assistant message
 * and renders the sources, citation check and source viewer for it. */
export const MessageCitations = ({
  message,
  children,
}: MessageCitationsProps) => {
  const [openCitation, setOpenCitation] = useState<Citation | null>(null);
  const { content, citations, citationCheck } = message;

  const contextValue = useMemo<CitationContextValue | null>(() => {
    if (!citations?.length && !citationCheck) return null;
    return {
      numbers: numberCitations(content, citations),
      citationsById: new Map((citations ?? []).map((c) => [c.id, c])),
      statements: citationCheck?.statements ?? [],
      openSource: setOpenCitation,
    };
  }, [content, citations, citationCheck]);

  const sources = useMemo(
    () => citedSources(content, citations),
    [content, citations]
  );

  if (!contextValue) return <>{children}</>;

  return (
    <CitationContext.Provider value={contextValue}>
      {children}
      {(sources.length > 0 || citationCheck) && !message.isStreaming && (
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
          {sources.length > 0 && (
            <SourcesList sources={sources} onOpen={setOpenCitation} />
          )}
          {citationCheck && <CitationCheckSummary check={citationCheck} />}
        </div>
      )}
      <CitationSourceViewer
        citation={openCitation}
        onClose={() => setOpenCitation(null)}
      />
    </CitationContext.Provider>
  );
};
