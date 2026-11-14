import type { Citation, CitationStatementCheck } from '../types/chat';

/** Mirrors CITATION_MARKER_PATTERN in agents_core/business_logic/citation_check.py */
const CITATION_MARKER_SOURCE = String.raw`\[\^([0-9a-f]{8})\]`;
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-Z0-9"'(])|\n+/g;
const SPACE_BEFORE_PUNCTUATION = /\s+([.,;:!?])/g;
const STATEMENT_EDGE_CHARACTERS = /^[ \-*#>\t]+|[ \-*#>\t]+$/g;
const FENCED_CODE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))/;
const INLINE_CODE = /(`[^`\n]*`)/;
const PARTIAL_MARKER_AT_END = /\[\^[0-9a-f]{0,8}$/;
const CITATION_HREF = /^#cite-([0-9a-f]{8})(?:-s(\d+))?$/;
const WORD_JOINER = '⁠';

export const CITATION_HREF_PREFIX = '#cite-';

const markerPattern = () => new RegExp(CITATION_MARKER_SOURCE, 'g');

export const citedIdsInOrder = (content: string): string[] => {
  const seen: string[] = [];
  for (const match of content.matchAll(markerPattern())) {
    if (!seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
};

/** Footnote numbers for the citations a message uses, in order of first use.
 * Markers that match no retrieved passage get no number. */
export const numberCitations = (
  content: string,
  citations: Citation[] | undefined
): Map<string, number> => {
  const known = new Set((citations ?? []).map((citation) => citation.id));
  const numbers = new Map<string, number>();
  for (const citationId of citedIdsInOrder(content)) {
    if (known.has(citationId)) numbers.set(citationId, numbers.size + 1);
  }
  return numbers;
};

/** The citations a message actually cites, in footnote order. */
export const citedSources = (
  content: string,
  citations: Citation[] | undefined
): Citation[] => {
  const byId = new Map((citations ?? []).map((c) => [c.id, c]));
  return [...numberCitations(content, citations).keys()].map(
    (citationId) => byId.get(citationId)!
  );
};

/** Same normalisation the backend applies before checking a statement, so a
 * rendered sentence can be matched back to its check result. */
export const normalizeStatement = (sentence: string): string =>
  sentence
    .replace(markerPattern(), '')
    .replace(STATEMENT_EDGE_CHARACTERS, '')
    .replace(SPACE_BEFORE_PUNCTUATION, '$1');

const splitKeepingSeparators = (text: string, pattern: RegExp): string[] => {
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const end = match.index + match[0].length;
    parts.push(text.slice(last, end));
    last = end;
  }
  parts.push(text.slice(last));
  return parts;
};

const linkMarkersInSentence = (
  sentence: string,
  statementIndex: number | undefined
): string =>
  sentence
    .split(INLINE_CODE)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part.replace(markerPattern(), (_marker, citationId, offset) => {
        const suffix =
          statementIndex === undefined ? '' : `-s${statementIndex}`;
        const link = `[${citationId}](${CITATION_HREF_PREFIX}${citationId}${suffix})`;
        return part[offset - 1] === '!' ? WORD_JOINER + link : link;
      });
    })
    .join('');

/** Turns [^id] markers into `#cite-` links that the markdown renderer shows
 * as footnotes. Markers in a sentence the citation check found unsupported
 * carry that statement's index. Code is left untouched. */
export const linkCitationMarkers = (
  markdown: string,
  statements: CitationStatementCheck[] = [],
  isStreaming = false
): string => {
  const text = isStreaming
    ? markdown.replace(PARTIAL_MARKER_AT_END, '')
    : markdown;
  const unsupported = new Map<string, number>();
  statements.forEach((statement, index) => {
    if (!statement.supported) unsupported.set(statement.text, index);
  });

  return text
    .split(FENCED_CODE)
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      return splitKeepingSeparators(segment, SENTENCE_BOUNDARY)
        .map((sentence) =>
          linkMarkersInSentence(
            sentence,
            unsupported.get(normalizeStatement(sentence.trim()))
          )
        )
        .join('');
    })
    .join('');
};

export const parseCitationHref = (
  href: string | undefined
): { citationId: string; statementIndex?: number } | null => {
  const match = href?.match(CITATION_HREF);
  if (!match) return null;
  return {
    citationId: match[1],
    statementIndex: match[2] === undefined ? undefined : Number(match[2]),
  };
};

/** Plain-text copy of an answer with markers shown as [1], [2]... */
export const formatCitationsForCopy = (
  content: string,
  numbers: Map<string, number>
): string =>
  content.replace(markerPattern(), (_marker, citationId) => {
    const number = numbers.get(citationId);
    return number ? `[${number}]` : '';
  });

export const mergeCitations = (
  existing: Citation[] | undefined,
  incoming: Citation[]
): Citation[] => {
  const merged = new Map((existing ?? []).map((c) => [c.id, c]));
  for (const citation of incoming) merged.set(citation.id, citation);
  return [...merged.values()];
};

/** Splits page text around the cited span. Falls back to finding the quote
 * when the stored offsets no longer line up with the page text. */
export const splitPageAtCitation = (
  pageText: string,
  citation: Pick<Citation, 'charStart' | 'charEnd' | 'quote'>
): { before: string; cited: string; after: string } | null => {
  let start = citation.charStart;
  let end = citation.charEnd;
  if (pageText.slice(start, end) !== citation.quote) {
    const found = pageText.indexOf(citation.quote);
    if (found === -1) return null;
    start = found;
    end = found + citation.quote.length;
  }
  return {
    before: pageText.slice(0, start),
    cited: pageText.slice(start, end),
    after: pageText.slice(end),
  };
};
