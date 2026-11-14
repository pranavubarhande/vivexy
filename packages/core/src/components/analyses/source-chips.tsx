'use client';

import { FileText } from 'lucide-react';
import type { Citation } from '../../types/chat';

interface SourceChipsProps {
  citations: Citation[];
  onOpen: (citation: Citation) => void;
  showFilename?: boolean;
}

const chipLabel = (citation: Citation, showFilename: boolean) => {
  const page = citation.paginated ? `p. ${citation.pageNumber}` : 'Source';
  return showFilename ? `${citation.filename} · ${page}` : page;
};

/** Small buttons that open each cited passage in the source viewer. */
export const SourceChips = ({
  citations,
  onOpen,
  showFilename = false,
}: SourceChipsProps) => {
  if (!citations.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {citations.map((citation) => (
        <button
          key={citation.id}
          type="button"
          data-testid="source-chip"
          title={citation.quote.replace(/\s+/g, ' ').slice(0, 300)}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(citation);
          }}
          className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-secondary/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FileText className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{chipLabel(citation, showFilename)}</span>
        </button>
      ))}
    </span>
  );
};
