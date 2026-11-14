'use client';

import { AlertTriangle, FileText, HelpCircle } from 'lucide-react';
import { cn } from '@vivexy/ui/utils';
import { Button } from '@vivexy/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@vivexy/ui/popover';
import { useCitationContext } from './citation-context';

const QUOTE_PREVIEW_CHARS = 420;

export const formatCitationLocation = (citation: {
  filename: string;
  paginated: boolean;
  pageNumber: number;
}) =>
  citation.paginated
    ? `${citation.filename} · p. ${citation.pageNumber}`
    : citation.filename;

const previewQuote = (quote: string) => {
  const collapsed = quote.replace(/\s+/g, ' ').trim();
  return collapsed.length > QUOTE_PREVIEW_CHARS
    ? `${collapsed.slice(0, QUOTE_PREVIEW_CHARS).trimEnd()}…`
    : collapsed;
};

interface CitationMarkerProps {
  citationId: string;
  statementIndex?: number;
}

export const CitationMarker = ({
  citationId,
  statementIndex,
}: CitationMarkerProps) => {
  const context = useCitationContext();
  if (!context) return null;

  const citation = context.citationsById.get(citationId);
  const number = context.numbers.get(citationId);
  const flaggedStatement =
    statementIndex === undefined
      ? undefined
      : context.statements[statementIndex];
  const isUnknown = !citation || !number;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-citation-id={citationId}
          aria-label={
            isUnknown
              ? 'Citation with no matching source'
              : `Source ${number}: ${formatCitationLocation(citation)}`
          }
          className={cn(
            'relative -top-[0.4em] mx-px inline-flex h-4 min-w-4 items-center justify-center rounded px-1 align-baseline text-[10px] font-semibold leading-none no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isUnknown
              ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
              : flaggedStatement
                ? 'bg-amber-500/20 text-amber-800 ring-1 ring-amber-500/50 hover:bg-amber-500/30 dark:text-amber-300'
                : 'bg-secondary text-foreground ring-1 ring-border hover:bg-accent'
          )}
        >
          {isUnknown ? '?' : number}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3 p-3 text-sm">
        {isUnknown ? (
          <div className="flex gap-2 text-muted-foreground">
            <HelpCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p>
              This marker doesn&apos;t match any passage the assistant
              retrieved, so the statement has no verifiable source.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate font-medium" title={citation.filename}>
                  {citation.filename}
                </p>
                {citation.paginated && (
                  <p className="text-xs text-muted-foreground">
                    Page {citation.pageNumber}
                  </p>
                )}
              </div>
            </div>
            <blockquote className="max-h-48 overflow-y-auto border-l-2 border-primary/40 pl-3 text-xs leading-relaxed text-muted-foreground">
              {previewQuote(citation.quote)}
            </blockquote>
            {flaggedStatement && (
              <div className="flex gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <p>
                  <span className="font-medium">
                    May not be supported by this source.
                  </span>{' '}
                  {flaggedStatement.reason}
                </p>
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => context.openSource(citation)}
            >
              View in document
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};
