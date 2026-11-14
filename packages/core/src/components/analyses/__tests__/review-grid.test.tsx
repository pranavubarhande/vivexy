import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ReviewGrid } from '../review-grid';
import { SummaryView } from '../summary-view';
import type { Analysis } from '../../../types/analysis';
import type { Citation } from '../../../types/chat';

vi.mock('../../../services/analyses.service', () => ({
  analysesService: {},
}));
vi.mock('../../../services/documents.service', () => ({
  documentsService: { getPage: vi.fn(), getFileUrl: vi.fn() },
}));

const LAW: Citation = {
  id: 'aaaaaaaa',
  chunkId: 'chunk-a',
  documentId: 'd1',
  filename: 'msa.pdf',
  paginated: true,
  pageNumber: 4,
  charStart: 0,
  charEnd: 40,
  quote: 'This Agreement is governed by the laws of Texas.',
};

const analysis = {
  id: 'a1',
  kind: 'review',
  status: 'running',
  questions: [{ id: 'law', label: 'Governing law', prompt: 'Which law?' }],
  documents: [
    { id: 'd1', filename: 'msa.pdf', available: true },
    { id: 'd2', filename: 'nda.pdf', available: true },
    { id: 'd3', filename: 'sow.pdf', available: true },
  ],
  results: [
    {
      id: 'r1',
      documentId: 'd1',
      questionId: 'law',
      status: 'done',
      answer: 'Texas',
      found: true,
      citations: [LAW],
      error: null,
    },
    {
      id: 'r2',
      documentId: 'd2',
      questionId: 'law',
      status: 'done',
      answer: 'Not found in this document',
      found: false,
      citations: [],
      error: null,
    },
    {
      id: 'r3',
      documentId: 'd3',
      questionId: 'law',
      status: 'pending',
      answer: null,
      found: null,
      citations: [],
      error: null,
    },
  ],
} as unknown as Analysis;

const renderWithQuery = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  );

describe('ReviewGrid', () => {
  it('shows answers with page chips, not-found cells and pending cells', () => {
    const onOpenSource = vi.fn();
    renderWithQuery(
      <ReviewGrid analysis={analysis} onOpenSource={onOpenSource} />
    );

    const grid = screen.getByTestId('review-grid');
    expect(within(grid).getByText('Governing law')).toBeTruthy();
    expect(within(grid).getByText('Texas')).toBeTruthy();
    expect(within(grid).getByTestId('review-cell-not-found')).toBeTruthy();
    expect(within(grid).getByText('Reading…')).toBeTruthy();

    fireEvent.click(within(grid).getByTestId('source-chip'));
    expect(onOpenSource).toHaveBeenCalledWith(LAW);
    expect(within(grid).getByTestId('source-chip').textContent).toBe('p. 4');
  });

  it('filters rows by answer text', () => {
    renderWithQuery(<ReviewGrid analysis={analysis} onOpenSource={vi.fn()} />);
    fireEvent.change(
      screen.getByPlaceholderText('Filter documents and answers'),
      {
        target: { value: 'texas' },
      }
    );
    expect(screen.getByText('1 of 3 documents')).toBeTruthy();
    expect(screen.queryByText('nda.pdf')).toBeNull();
  });
});

describe('SummaryView', () => {
  it('renders cited summaries with numbered sources', () => {
    const summary = {
      ...analysis,
      kind: 'summary',
      documents: [analysis.documents[0]],
      results: [
        {
          ...analysis.results[0],
          questionId: null,
          answer: 'The agreement is governed by Texas law [^aaaaaaaa].',
        },
      ],
    } as unknown as Analysis;
    renderWithQuery(<SummaryView analysis={summary} />);
    expect(screen.getByTestId('summary-section').textContent).toContain(
      'governed by Texas law'
    );
    expect(screen.getByTestId('citation-sources').textContent).toContain(
      'msa.pdf · p. 4'
    );
  });
});
