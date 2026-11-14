import { describe, expect, it } from 'vitest';
import {
  filterTimeline,
  progressPercent,
  reviewRows,
  timelinePeople,
} from '../analyses';
import type {
  Analysis,
  AnalysisResult,
  TimelineEvent,
} from '../../types/analysis';

const cell = (
  documentId: string,
  questionId: string,
  answer: string | null,
  found = true
): AnalysisResult => ({
  id: `${documentId}-${questionId}`,
  documentId,
  questionId,
  status: 'done',
  answer,
  found,
  citations: [],
  error: null,
});

const analysis = {
  id: 'a1',
  kind: 'review',
  questions: [
    { id: 'law', label: 'Governing law', prompt: 'Which law?' },
    { id: 'cap', label: 'Cap', prompt: 'What cap?' },
  ],
  documents: [
    { id: 'd1', filename: 'msa.pdf', available: true },
    { id: 'd2', filename: 'nda.pdf', available: true },
    { id: 'd3', filename: 'sow.pdf', available: true },
  ],
  results: [
    cell('d1', 'law', 'Texas'),
    cell('d2', 'law', 'Delaware'),
    cell('d3', 'law', 'Not found in this document', false),
    cell('d1', 'cap', '$1,000,000'),
    cell('d2', 'cap', '$250,000'),
  ],
} as unknown as Analysis;

describe('reviewRows', () => {
  it('keeps document order and maps cells by question', () => {
    const rows = reviewRows(analysis);
    expect(rows.map((row) => row.filename)).toEqual([
      'msa.pdf',
      'nda.pdf',
      'sow.pdf',
    ]);
    expect(rows[0].cells.get('cap')?.answer).toBe('$1,000,000');
    expect(rows[2].cells.has('cap')).toBe(false);
  });

  it('filters by filename or answer text, ignoring not-found answers', () => {
    expect(reviewRows(analysis, 'delaware').map((r) => r.documentId)).toEqual([
      'd2',
    ]);
    expect(reviewRows(analysis, 'SOW').map((r) => r.documentId)).toEqual([
      'd3',
    ]);
    expect(reviewRows(analysis, 'not found')).toEqual([]);
  });

  it('sorts by a column with empty answers last in both directions', () => {
    const ascending = reviewRows(analysis, '', {
      questionId: 'law',
      direction: 'asc',
    });
    expect(ascending.map((r) => r.documentId)).toEqual(['d2', 'd1', 'd3']);
    const descending = reviewRows(analysis, '', {
      questionId: 'law',
      direction: 'desc',
    });
    expect(descending.map((r) => r.documentId)).toEqual(['d1', 'd2', 'd3']);
  });
});

describe('timeline helpers', () => {
  const events: TimelineEvent[] = [
    {
      date: '5 January 2023',
      sortDate: '2023-01-05',
      event: 'Agreement signed',
      people: ['Northwind', 'Marston'],
      documentId: 'd1',
      filename: 'memo.docx',
      citations: [],
    },
    {
      date: '1 March 2024',
      sortDate: '2024-03-01',
      event: 'Notice of breach sent',
      people: ['Northwind'],
      documentId: 'd1',
      filename: 'memo.docx',
      citations: [],
    },
  ];

  it('lists people once, sorted', () => {
    expect(timelinePeople(events)).toEqual(['Marston', 'Northwind']);
  });

  it('filters by text and person', () => {
    expect(filterTimeline(events, 'breach')).toHaveLength(1);
    expect(filterTimeline(events, '', 'Marston')).toHaveLength(1);
    expect(filterTimeline(events, 'memo', 'Northwind')).toHaveLength(2);
  });
});

describe('progressPercent', () => {
  it('counts failed cells as finished', () => {
    expect(progressPercent({ total: 4, done: 1, failed: 1 })).toBe(50);
    expect(progressPercent({ total: 0, done: 0, failed: 0 })).toBe(0);
  });
});
