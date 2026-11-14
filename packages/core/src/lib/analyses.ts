import type {
  Analysis,
  AnalysisKind,
  AnalysisProgress,
  AnalysisResult,
  TimelineEvent,
} from '../types/analysis';

export const ANALYSIS_KIND_LABELS: Record<AnalysisKind, string> = {
  review: 'Review grid',
  summary: 'Summary',
  timeline: 'Timeline',
};

/** Mirrors ANALYSIS_MAX_DOCUMENTS and ANALYSIS_MAX_QUESTIONS in
 * agents_core/constants/analyses.py (their defaults). */
export const ANALYSIS_MAX_DOCUMENTS: Record<AnalysisKind, number> = {
  review: 100,
  summary: 20,
  timeline: 50,
};
export const ANALYSIS_MAX_QUESTIONS = 15;

export const progressPercent = (progress: AnalysisProgress) =>
  progress.total
    ? Math.round(((progress.done + progress.failed) / progress.total) * 100)
    : 0;

export const cellKey = (documentId: string, questionId: string | null) =>
  `${documentId}:${questionId ?? ''}`;

export const resultsByCell = (results: AnalysisResult[]) =>
  new Map(
    results.map((result) => [
      cellKey(result.documentId, result.questionId),
      result,
    ])
  );

export type ReviewSort = { questionId: string; direction: 'asc' | 'desc' };

export interface ReviewRow {
  documentId: string;
  filename: string;
  available: boolean;
  cells: Map<string, AnalysisResult>;
}

const cellText = (result: AnalysisResult | undefined) =>
  result?.status === 'done' && result.found ? (result.answer ?? '') : '';

/** Rows of a review grid, filtered by text in the filename or any answer and
 * sorted by one question's answers. Empty answers sort last either way. */
export const reviewRows = (
  analysis: Analysis,
  filter = '',
  sort: ReviewSort | null = null
): ReviewRow[] => {
  const cells = resultsByCell(analysis.results);
  const needle = filter.trim().toLowerCase();
  const rows = analysis.documents.map((document) => ({
    documentId: document.id,
    filename: document.filename,
    available: document.available,
    cells: new Map(
      analysis.questions.flatMap((question) => {
        const result = cells.get(cellKey(document.id, question.id));
        return result ? [[question.id, result] as const] : [];
      })
    ),
  }));
  const filtered = needle
    ? rows.filter(
        (row) =>
          row.filename.toLowerCase().includes(needle) ||
          [...row.cells.values()].some((result) =>
            cellText(result).toLowerCase().includes(needle)
          )
      )
    : rows;
  if (!sort) return filtered;
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...filtered].sort((left, right) => {
    const a = cellText(left.cells.get(sort.questionId));
    const b = cellText(right.cells.get(sort.questionId));
    if (!a || !b) return a ? -1 : b ? 1 : 0;
    return (
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) *
      factor
    );
  });
};

export const filterTimeline = (
  events: TimelineEvent[],
  filter = '',
  person = ''
) => {
  const needle = filter.trim().toLowerCase();
  return events.filter(
    (event) =>
      (!person || event.people.includes(person)) &&
      (!needle ||
        [event.event, event.date ?? '', event.filename ?? '', ...event.people]
          .join(' ')
          .toLowerCase()
          .includes(needle))
  );
};

export const timelinePeople = (events: TimelineEvent[]) =>
  [...new Set(events.flatMap((event) => event.people))].sort((a, b) =>
    a.localeCompare(b)
  );
