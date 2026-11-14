import { describe, expect, it, vi } from 'vitest';
import { handleStreamEvent } from '../use-stream-event-handler';
import type { Citation, CitationCheck, Message } from '../../types/chat';

vi.mock('../useInstalledSkills', () => ({ syncAgentSavedSkill: vi.fn() }));

const citation = (id: string, quote = 'quote'): Citation => ({
  id,
  chunkId: `chunk-${id}`,
  documentId: 'doc-1',
  filename: 'msa.pdf',
  paginated: true,
  pageNumber: 2,
  charStart: 0,
  charEnd: quote.length,
  quote,
});

const setup = () => {
  const assistantMsg: Message = {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
  };
  const updateStreaming = vi.fn();
  const deps = {
    targetChatId: 'chat-1',
    assistantMsg,
    cache: {} as never,
    accumulator: { content: '', reasoning: [], timeline: [] },
    setApprovalRequest: vi.fn(),
    setIsWaitingApproval: vi.fn(),
    setFormQuestion: vi.fn(),
    refetchHistory: vi.fn(),
    userMsgId: 'user-1',
    onUserMessageIdReceived: vi.fn(),
    updateStreaming,
  };
  return { assistantMsg, updateStreaming, deps };
};

describe('handleStreamEvent citations', () => {
  it('collects citations across search calls without duplicates', () => {
    const { assistantMsg, updateStreaming, deps } = setup();
    handleStreamEvent(
      {
        type: 'citations',
        data: { citations: [citation('aaaaaaaa'), citation('bbbbbbbb')] },
      },
      deps
    );
    handleStreamEvent(
      {
        type: 'citations',
        data: {
          citations: [citation('bbbbbbbb', 'updated'), citation('cccccccc')],
        },
      },
      deps
    );

    expect(assistantMsg.citations?.map((c) => [c.id, c.quote])).toEqual([
      ['aaaaaaaa', 'quote'],
      ['bbbbbbbb', 'updated'],
      ['cccccccc', 'quote'],
    ]);
    expect(updateStreaming).toHaveBeenLastCalledWith({
      citations: assistantMsg.citations,
    });
  });

  it('stores the citation check on the streaming message', () => {
    const { assistantMsg, updateStreaming, deps } = setup();
    const check: CitationCheck = {
      messageId: 'assistant-1',
      statements: [
        {
          text: 'Notice is 90 days.',
          citationIds: ['aaaaaaaa'],
          supported: true,
          reason: 'Stated directly.',
        },
      ],
      unsupportedCount: 0,
      unknownCitationIds: [],
    };
    handleStreamEvent({ type: 'citation_check', data: check }, deps);

    expect(assistantMsg.citationCheck).toEqual(check);
    expect(updateStreaming).toHaveBeenCalledWith({ citationCheck: check });
  });
});
