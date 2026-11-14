'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { MessageCitations } from '../chat/message-citations';
import { MessageStream } from '../chat/message-stream';
import type { Analysis, AnalysisResult } from '../../types/analysis';

const SummaryBody = ({ result }: { result: AnalysisResult | undefined }) => {
  if (!result || result.status === 'pending') {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Summarizing…
      </p>
    );
  }
  if (result.status === 'failed') {
    return (
      <p className="inline-flex items-center gap-1.5 text-sm text-destructive">
        <AlertCircle className="size-3.5" />
        {result.error ?? 'Could not summarize this document'}
      </p>
    );
  }
  const content = result.answer ?? '';
  return (
    <MessageCitations
      message={{
        id: result.id,
        role: 'assistant',
        content,
        citations: result.citations,
        createdAt: '',
      }}
    >
      <MessageStream content={content} role="assistant" />
    </MessageCitations>
  );
};

/** One cited summary per document. Markers open the source viewer the same
 * way they do in chat. */
export const SummaryView = ({ analysis }: { analysis: Analysis }) => {
  const results = new Map(
    analysis.results.map((result) => [result.documentId, result])
  );
  return (
    <div className="space-y-4">
      {analysis.documents.map((document) => (
        <section
          key={document.id}
          data-testid="summary-section"
          className="rounded-lg border border-border bg-card p-4"
        >
          <h3 className="text-sm font-semibold">{document.filename}</h3>
          <SummaryBody result={results.get(document.id)} />
        </section>
      ))}
    </div>
  );
};
