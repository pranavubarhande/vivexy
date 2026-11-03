// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('@vivexy/core/services/documents.service', () => ({
  documentsService: {
    getPage: vi.fn().mockResolvedValue({
      documentId: 'doc-1',
      pageNumber: 1,
      pageCount: 5,
      text: 'Some page text for testing.',
      ocr: false,
    }),
  },
}));

vi.mock('@vivexy/core/chat/artifact-content', () => ({
  MERMAID_IFRAME: (src: string) => `<html>${src}</html>`,
}));

// react-markdown renders children as text in jsdom — provide a thin mock so
// tests don't need the full unified/remark pipeline (and unist-util-visit).
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="md">{children}</div>,
}));
vi.mock('remark-gfm', () => ({ default: () => () => {} }));

// Dialog from @vivexy/ui
vi.mock('@vivexy/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@vivexy/ui/utils', () => ({
  cn: (...args: (string | undefined | false)[]) => args.filter(Boolean).join(' '),
}));

import React from 'react';
import { CitationFootnotes, CitationMessageStream } from '../citation-footnotes';
import type { Citation, CitationCheck } from '@vivexy/core/types/chat';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const makeCitation = (overrides: Partial<Citation> = {}): Citation => ({
  id: 'abcd1234',
  chunkId: 'chunk-1',
  documentId: 'doc-1',
  filename: 'contract.pdf',
  paginated: true,
  pageNumber: 3,
  charStart: 0,
  charEnd: 20,
  quote: 'The parties agree to',
  ...overrides,
});

const CONTENT_WITH_REF = 'The parties agree.[^abcd1234] See also the schedule.';
const CONTENT_TWO_REFS =
  'First clause.[^abcd1234] Second clause.[^efgh5678] End.';

// ---------------------------------------------------------------------------
// CitationFootnotes — renders numbered reference list
// ---------------------------------------------------------------------------

describe('CitationFootnotes', () => {
  it('renders nothing when citations array is empty and no citationCheck', () => {
    const { container } = render(
      <CitationFootnotes citations={[]} content="" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a footnote for each cited id in order of appearance', () => {
    const c1 = makeCitation({ id: 'abcd1234', filename: 'contract.pdf' });
    const c2 = makeCitation({
      id: 'efgh5678',
      filename: 'schedule.pdf',
      pageNumber: 1,
    });
    render(
      <CitationFootnotes
        citations={[c1, c2]}
        content={CONTENT_TWO_REFS}
      />
    );
    const items = screen.getAllByText(/contract\.pdf|schedule\.pdf/);
    expect(items.length).toBeGreaterThanOrEqual(2);
    // First mention in text → [1] contract.pdf
    expect(screen.getByText('contract.pdf')).toBeTruthy();
    expect(screen.getByText('schedule.pdf')).toBeTruthy();
  });

  it('shows number badges [1] and [2] for two citations', () => {
    const c1 = makeCitation({ id: 'abcd1234' });
    const c2 = makeCitation({ id: 'efgh5678', filename: 'schedule.pdf' });
    const { container } = render(
      <CitationFootnotes citations={[c1, c2]} content={CONTENT_TWO_REFS} />
    );
    expect(container.textContent).toContain('[1]');
    expect(container.textContent).toContain('[2]');
  });

  it('renders citations not referenced in text after referenced ones', () => {
    const referenced = makeCitation({ id: 'abcd1234', filename: 'main.pdf' });
    const unreferenced = makeCitation({ id: '00000000', filename: 'extra.pdf' });
    const { container } = render(
      <CitationFootnotes
        citations={[referenced, unreferenced]}
        content={CONTENT_WITH_REF}
      />
    );
    expect(container.textContent).toContain('main.pdf');
    expect(container.textContent).toContain('extra.pdf');
    expect(container.textContent).toContain('[1]');
    expect(container.textContent).toContain('[2]');
  });

  it('shows page number when paginated=true', () => {
    const c = makeCitation({ paginated: true, pageNumber: 7 });
    render(<CitationFootnotes citations={[c]} content={CONTENT_WITH_REF} />);
    expect(screen.getByText('p.7')).toBeTruthy();
  });

  it('does not show page number when paginated=false', () => {
    const c = makeCitation({ paginated: false });
    render(<CitationFootnotes citations={[c]} content={CONTENT_WITH_REF} />);
    expect(screen.queryByText(/^p\.\d/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CitationFootnotes — citation check banner
// ---------------------------------------------------------------------------

describe('CitationFootnotes — citation check banner', () => {
  const check: CitationCheck = {
    statements: [
      {
        text: 'The governing law is California.',
        citationIds: ['abcd1234'],
        supported: false,
        reason: 'No mention of California found in cited pages.',
      },
      {
        text: 'The parties agree to keep this confidential.',
        citationIds: ['abcd1234'],
        supported: true,
        reason: '',
      },
    ],
    unsupportedCount: 1,
    unknownCitationIds: [],
  };

  it('renders banner when unsupportedCount > 0', () => {
    const c = makeCitation();
    render(
      <CitationFootnotes
        citations={[c]}
        citationCheck={check}
        content={CONTENT_WITH_REF}
      />
    );
    expect(screen.getByText(/1 statement could not be verified/i)).toBeTruthy();
  });

  it('does not render banner when unsupportedCount = 0', () => {
    const c = makeCitation();
    const allSupported: CitationCheck = {
      ...check,
      unsupportedCount: 0,
      statements: check.statements.map((s) => ({ ...s, supported: true })),
    };
    render(
      <CitationFootnotes
        citations={[c]}
        citationCheck={allSupported}
        content={CONTENT_WITH_REF}
      />
    );
    expect(screen.queryByText(/could not be verified/i)).toBeNull();
  });

  it('expands unsupported statements on click', () => {
    const c = makeCitation();
    render(
      <CitationFootnotes
        citations={[c]}
        citationCheck={check}
        content={CONTENT_WITH_REF}
      />
    );
    // Initially collapsed
    expect(screen.queryByText(/No mention of California/i)).toBeNull();
    // Click banner button
    fireEvent.click(screen.getByText(/1 statement could not be verified/i));
    // Now visible
    expect(screen.getByText(/No mention of California/i)).toBeTruthy();
  });

  it('shows plural "statements" when count > 1', () => {
    const c = makeCitation();
    const multiCheck: CitationCheck = {
      ...check,
      unsupportedCount: 2,
      statements: [
        { text: 'A', citationIds: [], supported: false, reason: 'r1' },
        { text: 'B', citationIds: [], supported: false, reason: 'r2' },
      ],
    };
    render(
      <CitationFootnotes
        citations={[c]}
        citationCheck={multiCheck}
        content={CONTENT_WITH_REF}
      />
    );
    expect(screen.getByText(/2 statements could not be verified/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// CitationMessageStream — smoke test
// ---------------------------------------------------------------------------

describe('CitationMessageStream', () => {
  it('renders content inside a ReactMarkdown-backed element', () => {
    const c = makeCitation();
    render(
      <CitationMessageStream
        content={CONTENT_WITH_REF}
        citations={[c]}
      />
    );
    // Our react-markdown mock wraps content in data-testid="md"
    expect(screen.getByTestId('md')).toBeTruthy();
  });

  it('renders without crashing when citations is empty', () => {
    render(
      <CitationMessageStream
        content="No citations here."
        citations={[]}
      />
    );
    expect(screen.getByTestId('md')).toBeTruthy();
  });
});

// Note: handleStreamEvent citation event tests live in
// src/hooks/__tests__/citation-stream-events.test.ts (node environment, no DOM needed).
