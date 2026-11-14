'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  ScanText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@vivexy/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@vivexy/ui/sheet';
import { useDocumentFileUrl, useDocumentPage } from '../../hooks/useDocuments';
import { splitPageAtCitation } from '../../lib/citations';
import type { Citation } from '../../types/chat';

interface CitationSourceViewerProps {
  citation: Citation | null;
  onClose: () => void;
}

const PageText = ({
  citation,
  text,
  isCitedPage,
}: {
  citation: Citation;
  text: string;
  isCitedPage: boolean;
}) => {
  const highlightRef = useRef<HTMLElement>(null);
  const parts = isCitedPage ? splitPageAtCitation(text, citation) : null;

  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: 'center' });
  }, [text, citation.id, isCitedPage]);

  if (!text.trim()) {
    return (
      <p className="text-sm text-muted-foreground">
        No text was found on this page.
      </p>
    );
  }

  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
      {parts ? (
        <>
          {parts.before}
          <mark
            ref={highlightRef}
            data-testid="citation-highlight"
            className="rounded-sm bg-amber-200/80 px-0.5 text-foreground dark:bg-amber-500/30"
          >
            {parts.cited}
          </mark>
          {parts.after}
        </>
      ) : (
        text
      )}
    </div>
  );
};

export const CitationSourceViewer = ({
  citation,
  onClose,
}: CitationSourceViewerProps) => {
  const [pageNumber, setPageNumber] = useState(citation?.pageNumber ?? 1);
  const [shownCitationId, setShownCitationId] = useState(citation?.id);
  if (citation && citation.id !== shownCitationId) {
    setShownCitationId(citation.id);
    setPageNumber(citation.pageNumber);
  }

  const pageQuery = useDocumentPage(citation?.documentId, pageNumber);
  const fileUrl = useDocumentFileUrl();
  const pageCount = pageQuery.data?.pageCount ?? null;

  const openOriginal = () => {
    if (!citation) return;
    const tab = window.open('about:blank', '_blank');
    fileUrl.mutate(citation.documentId, {
      onSuccess: (url) => {
        if (tab) {
          tab.opener = null;
          tab.location.href = url;
        } else {
          window.location.assign(url);
        }
      },
      onError: () => {
        tab?.close();
        toast.error('Could not open the original file.');
      },
    });
  };

  return (
    <Sheet open={!!citation} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        data-testid="citation-source-viewer"
      >
        {citation && (
          <>
            <SheetHeader className="border-b p-4 pr-12">
              <SheetTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{citation.filename}</span>
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-x-2 text-xs">
                {citation.paginated ? (
                  <span>
                    Page {pageNumber}
                    {pageCount ? ` of ${pageCount}` : ''}
                  </span>
                ) : (
                  <span>Document text</span>
                )}
                {pageNumber === citation.pageNumber && (
                  <span>· cited passage highlighted</span>
                )}
                {pageQuery.data?.ocr && (
                  <span className="inline-flex items-center gap-1">
                    · <ScanText className="size-3" /> text from OCR
                  </span>
                )}
              </SheetDescription>
              <div className="flex items-center justify-between gap-2 pt-2">
                {citation.paginated && pageCount && pageCount > 1 ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Previous page"
                      disabled={pageNumber <= 1}
                      onClick={() => setPageNumber((page) => page - 1)}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Next page"
                      disabled={pageNumber >= pageCount}
                      onClick={() => setPageNumber((page) => page + 1)}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                    {pageNumber !== citation.pageNumber && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPageNumber(citation.pageNumber)}
                      >
                        Back to cited page
                      </Button>
                    )}
                  </div>
                ) : (
                  <span />
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openOriginal}
                  disabled={fileUrl.isPending}
                >
                  {fileUrl.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="size-3.5" />
                  )}
                  Open original
                </Button>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {pageQuery.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading page…
                </div>
              )}
              {pageQuery.isError && (
                <p className="text-sm text-muted-foreground">
                  This page couldn&apos;t be loaded. The document may have been
                  deleted, or you may no longer have access to it.
                </p>
              )}
              {pageQuery.data && (
                <PageText
                  citation={citation}
                  text={pageQuery.data.text}
                  isCitedPage={pageNumber === citation.pageNumber}
                />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
