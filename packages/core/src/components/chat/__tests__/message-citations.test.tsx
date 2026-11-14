import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../chat-message';
import { documentsService } from '../../../services/documents.service';
import type { Citation, Message } from '../../../types/chat';

vi.mock('../../../services/documents.service', () => ({
  documentsService: { getPage: vi.fn(), getFileUrl: vi.fn() },
}));

const PAGE_TWO =
  'Schedule B.\n\nThe liability cap is limited to twelve months of fees.\n\nGoverning law is Delaware.';

const NOTICE: Citation = {
  id: 'aaaaaaaa',
  chunkId: 'chunk-a',
  documentId: 'doc-msa',
  filename: 'msa.pdf',
  paginated: true,
  pageNumber: 1,
  charStart: 0,
  charEnd: 60,
  quote: 'Either party may terminate on ninety (90) days written notice.',
};

const CAP: Citation = {
  id: 'bbbbbbbb',
  chunkId: 'chunk-b',
  documentId: 'doc-msa',
  filename: 'msa.pdf',
  paginated: true,
  pageNumber: 2,
  charStart: 13,
  charEnd: 67,
  quote: 'The liability cap is limited to twelve months of fees.',
};

const baseMessage: Message = {
  id: 'assistant-1',
  role: 'assistant',
  content:
    'Liability is capped at twelve months of fees [^bbbbbbbb]. Either party can terminate on 30 days notice [^aaaaaaaa]. The cap also covers indemnity [^bbbbbbbb][^cccccccc].',
  createdAt: '2026-11-04T10:00:00',
  citations: [NOTICE, CAP],
  citationCheck: {
    statements: [
      {
        text: 'Liability is capped at twelve months of fees.',
        citationIds: ['bbbbbbbb'],
        supported: true,
        reason: 'Stated directly.',
      },
      {
        text: 'Either party can terminate on 30 days notice.',
        citationIds: ['aaaaaaaa'],
        supported: false,
        reason: 'The passage says ninety days, not 30.',
      },
      {
        text: 'The cap also covers indemnity.',
        citationIds: ['bbbbbbbb', 'cccccccc'],
        supported: true,
        reason: 'ok',
      },
    ],
    unsupportedCount: 1,
    unknownCitationIds: ['cccccccc'],
  },
};

const renderMessage = (message: Message = baseMessage) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AssistantMessage message={message} />
    </QueryClientProvider>
  );

const markers = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('button[data-citation-id]'));

describe('AssistantMessage citations', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(documentsService.getPage).mockReset();
  });

  it('numbers markers by first use and flags unknown ones', () => {
    const { container } = renderMessage();
    expect(
      markers(container).map((marker) => [
        marker.getAttribute('data-citation-id'),
        marker.textContent,
      ])
    ).toEqual([
      ['bbbbbbbb', '1'],
      ['aaaaaaaa', '2'],
      ['bbbbbbbb', '1'],
      ['cccccccc', '?'],
    ]);
    expect(container.textContent).not.toContain('[^');
  });

  it('lists cited sources in footnote order', () => {
    renderMessage();
    const sources = within(screen.getByTestId('citation-sources'));
    const items = sources.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('msa.pdf · p. 2');
    expect(items[1]).toHaveTextContent('msa.pdf · p. 1');
  });

  it('shows the quote, file and page in a popover, with the check verdict', async () => {
    const { container } = renderMessage();
    fireEvent.click(markers(container)[1]);

    const popover = within(await screen.findByRole('dialog'));
    expect(popover.getByText(NOTICE.quote)).toBeInTheDocument();
    expect(popover.getByText('msa.pdf')).toBeInTheDocument();
    expect(popover.getByText('Page 1')).toBeInTheDocument();
    expect(
      popover.getByText('The passage says ninety days, not 30.')
    ).toBeInTheDocument();
  });

  it('summarises the citation check and lists unsupported statements', async () => {
    renderMessage();
    const summary = screen.getByTestId('citation-check-summary');
    expect(summary).toHaveTextContent(
      '1 of 3 cited statements may not be supported by their sources · 1 citation matches no source'
    );
    fireEvent.click(within(summary).getByRole('button'));
    expect(summary).toHaveTextContent(
      '“Either party can terminate on 30 days notice.”'
    );
  });

  it('reports a clean check', () => {
    renderMessage({
      ...baseMessage,
      content: 'Capped at twelve months [^bbbbbbbb].',
      citationCheck: {
        statements: [
          {
            text: 'Capped at twelve months.',
            citationIds: ['bbbbbbbb'],
            supported: true,
            reason: 'ok',
          },
        ],
        unsupportedCount: 0,
        unknownCitationIds: [],
      },
    });
    expect(screen.getByTestId('citation-check-summary')).toHaveTextContent(
      'The cited statement is supported by its source.'
    );
  });

  it('opens the source page with the cited span highlighted', async () => {
    vi.mocked(documentsService.getPage).mockResolvedValue({
      documentId: 'doc-msa',
      pageNumber: 2,
      pageCount: 2,
      text: PAGE_TWO,
      ocr: true,
    });
    const { container } = renderMessage();
    fireEvent.click(markers(container)[0]);
    fireEvent.click(
      await screen.findByRole('button', { name: 'View in document' })
    );

    const highlight = await screen.findByTestId('citation-highlight');
    expect(highlight).toHaveTextContent(CAP.quote);
    expect(documentsService.getPage).toHaveBeenCalledWith('doc-msa', 2);
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('renders plain answers without citation UI', () => {
    renderMessage({
      id: 'assistant-2',
      role: 'assistant',
      content: 'No documents were searched.',
      createdAt: '2026-11-04T10:00:00',
    });
    expect(screen.queryByTestId('citation-sources')).not.toBeInTheDocument();
    expect(screen.getByText('No documents were searched.')).toBeInTheDocument();
  });
});
