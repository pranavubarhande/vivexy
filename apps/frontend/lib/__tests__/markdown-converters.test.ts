import { describe, it, expect, vi } from 'vitest';
import { convertMarkdownToWord } from '../markdown-converters';

// Mock docx packer since we only want to test the parsing logic
vi.mock('docx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('docx')>();
  return {
    ...actual,
    Packer: {
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-docx-buffer')),
    },
  };
});

// Skip Puppeteer test because it requires browser binaries in test env
describe('markdown-converters', () => {
  describe('convertMarkdownToWord', () => {
    it('should parse markdown and convert to word docx buffer', async () => {
      const markdown = `
# Heading 1
Regular paragraph text here.

## Heading 2
Another paragraph.

### Heading 3
\`\`\`
Code block line 1
Code block line 2
\`\`\`
Last paragraph.
      `.trim();

      const result = await convertMarkdownToWord(markdown, 'Test Document');

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString()).toBe('mock-docx-buffer');
    });
  });
});
