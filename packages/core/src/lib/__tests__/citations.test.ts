import { describe, expect, it } from 'vitest';
import {
  citedIdsInOrder,
  citedSources,
  formatCitationsForCopy,
  linkCitationMarkers,
  mergeCitations,
  normalizeStatement,
  numberCitations,
  parseCitationHref,
  splitPageAtCitation,
} from '../citations';
import type { Citation, CitationStatementCheck } from '../../types/chat';

const citation = (id: string, overrides: Partial<Citation> = {}): Citation => ({
  id,
  chunkId: `chunk-${id}`,
  documentId: `doc-${id}`,
  filename: `${id}.pdf`,
  paginated: true,
  pageNumber: 1,
  charStart: 0,
  charEnd: 5,
  quote: 'quote',
  ...overrides,
});

const A = 'aaaaaaaa';
const B = 'bbbbbbbb';
const C = 'cccccccc';

describe('citation numbering', () => {
  it('lists each cited id once, in order of first use', () => {
    expect(citedIdsInOrder(`x [^${B}] y [^${A}] z [^${B}]`)).toEqual([B, A]);
  });

  it('numbers known citations by first use and skips unknown ids', () => {
    const numbers = numberCitations(
      `One [^${B}]. Two [^${C}]. Three [^${A}][^${B}].`,
      [citation(A), citation(B)]
    );
    expect([...numbers.entries()]).toEqual([
      [B, 1],
      [A, 2],
    ]);
  });

  it('returns cited sources in footnote order', () => {
    const sources = citedSources(`[^${B}] then [^${A}]`, [
      citation(A),
      citation(B),
      citation(C),
    ]);
    expect(sources.map((source) => source.id)).toEqual([B, A]);
  });

  it('formats markers as numbers when copying', () => {
    const numbers = new Map([[A, 1]]);
    expect(formatCitationsForCopy(`Fact [^${A}]. Odd [^${C}].`, numbers)).toBe(
      'Fact [1]. Odd .'
    );
  });
});

describe('linkCitationMarkers', () => {
  it('turns markers into cite links', () => {
    expect(linkCitationMarkers(`Fact [^${A}].`)).toBe(
      `Fact [${A}](#cite-${A}).`
    );
  });

  it('leaves code untouched', () => {
    const markdown = `Use \`[^${A}]\` literally.\n\n\`\`\`\n[^${A}]\n\`\`\`\nReal [^${A}].`;
    const linked = linkCitationMarkers(markdown);
    expect(linked).toContain(`\`[^${A}]\``);
    expect(linked).toContain(`\`\`\`\n[^${A}]\n\`\`\``);
    expect(linked).toContain(`Real [${A}](#cite-${A}).`);
  });

  it('keeps a marker after "!" from becoming an image', () => {
    expect(linkCitationMarkers(`Wow![^${A}]`)).toBe(`Wow!⁠[${A}](#cite-${A})`);
  });

  it('hides a half-streamed marker only while streaming', () => {
    expect(linkCitationMarkers('Notice period [^1a2', [], true)).toBe(
      'Notice period '
    );
    expect(linkCitationMarkers('Notice period [^1a2', [], false)).toBe(
      'Notice period [^1a2'
    );
  });

  it('flags markers in sentences the check found unsupported', () => {
    const statements: CitationStatementCheck[] = [
      {
        text: 'The term is two years.',
        citationIds: [A],
        supported: true,
        reason: 'ok',
      },
      {
        text: 'Either party may terminate on 30 days notice.',
        citationIds: [B],
        supported: false,
        reason: 'The passage says 90 days.',
      },
    ];
    const markdown = `The term is two years [^${A}]. Either party may terminate on 30 days notice [^${B}].\n- **Note**: see above [^${A}].`;
    const linked = linkCitationMarkers(markdown, statements);
    expect(linked).toContain(`two years [${A}](#cite-${A}).`);
    expect(linked).toContain(`notice [${B}](#cite-${B}-s1).`);
    expect(linked).toContain(`see above [${A}](#cite-${A}).`);
  });
});

describe('normalizeStatement', () => {
  it('matches the backend normalisation', () => {
    expect(normalizeStatement(`- The cap is 12 months [^${A}].`)).toBe(
      'The cap is 12 months.'
    );
    expect(normalizeStatement(`- **Note**: see above [^${A}].`)).toBe(
      'Note**: see above.'
    );
    expect(normalizeStatement(`> ## Notice [^${A}] , then cure`)).toBe(
      'Notice, then cure'
    );
  });
});

describe('parseCitationHref', () => {
  it('parses plain and flagged links and ignores other links', () => {
    expect(parseCitationHref(`#cite-${A}`)).toEqual({
      citationId: A,
      statementIndex: undefined,
    });
    expect(parseCitationHref(`#cite-${A}-s3`)).toEqual({
      citationId: A,
      statementIndex: 3,
    });
    expect(parseCitationHref('https://example.com')).toBeNull();
    expect(parseCitationHref(undefined)).toBeNull();
  });
});

describe('splitPageAtCitation', () => {
  const page = 'Intro. Either party may terminate. Outro.';

  it('splits at the stored offsets', () => {
    expect(
      splitPageAtCitation(page, {
        charStart: 7,
        charEnd: 34,
        quote: 'Either party may terminate.',
      })
    ).toEqual({
      before: 'Intro. ',
      cited: 'Either party may terminate.',
      after: ' Outro.',
    });
  });

  it('falls back to finding the quote when offsets drift', () => {
    expect(
      splitPageAtCitation(page, {
        charStart: 0,
        charEnd: 4,
        quote: 'Either party may terminate.',
      })?.cited
    ).toBe('Either party may terminate.');
  });

  it('returns null when the quote is not on the page', () => {
    expect(
      splitPageAtCitation(page, { charStart: 0, charEnd: 3, quote: 'missing' })
    ).toBeNull();
  });
});

describe('mergeCitations', () => {
  it('adds new citations and replaces ones with the same id', () => {
    const merged = mergeCitations(
      [citation(A), citation(B)],
      [citation(B, { quote: 'new' }), citation(C)]
    );
    expect(merged.map((c) => [c.id, c.quote])).toEqual([
      [A, 'quote'],
      [B, 'new'],
      [C, 'quote'],
    ]);
  });
});
