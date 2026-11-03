// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStreamEvent } from '../use-stream-event-handler';
import type { Message } from '@vivexy/core/services/chat.service';
import type { Citation, CitationCheck } from '@vivexy/core/types/chat';
import {
  STREAM_EVENT_CITATIONS,
  STREAM_EVENT_CITATION_CHECK,
} from '@vivexy/core/constants/stream-events';

// useInstalledSkills has an import that auto-invokes react hooks — mock it
vi.mock('../useInstalledSkills', () => ({
  syncAgentSavedSkill: vi.fn().mockResolvedValue(undefined),
}));

// platform helpers
vi.mock('@vivexy/core/lib/platform', () => ({
  platform: {
    isWeb: false,
    isDesktop: false,
    executeTool: vi.fn(),
  },
}));

// chat keys
vi.mock('../useChat', () => ({
  chatKeys: {
    list: () => ['chats'],
    detail: (id: string) => ['chats', id],
    artifacts: (id: string) => ['chats', id, 'artifacts'],
    messages: (id: string) => ['chats', id, 'messages'],
  },
}));

const makeCitation = (id: string = 'abcd1234'): Citation => ({
  id,
  chunkId: `chunk-${id}`,
  documentId: 'doc-1',
  filename: 'contract.pdf',
  paginated: true,
  pageNumber: 3,
  charStart: 0,
  charEnd: 20,
  quote: 'test quote',
});

function makeDeps(overrides: Record<string, unknown> = {}) {
  const updateStreaming = vi.fn();
  return {
    targetChatId: 'chat-1',
    assistantMsg: {
      id: 'msg-1',
      role: 'assistant' as const,
      content: '',
      createdAt: new Date().toISOString(),
    } as Message,
    cache: {
      qc: {
        setQueryData: vi.fn(),
        getQueryData: vi.fn(() => []),
        invalidateQueries: vi.fn(),
      },
      appendArtifact: vi.fn(),
      patchArtifact: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    accumulator: { content: '', reasoning: [], timeline: [] },
    setApprovalRequest: vi.fn(),
    setIsWaitingApproval: vi.fn(),
    setFormQuestion: vi.fn(),
    refetchHistory: vi.fn(),
    userMsgId: '',
    onUserMessageIdReceived: vi.fn(),
    updateStreaming,
    ...overrides,
  };
}

describe('handleStreamEvent — STREAM_EVENT_CITATIONS', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores citations on assistantMsg and calls updateStreaming', () => {
    const citations: Citation[] = [makeCitation()];
    const deps = makeDeps();
    handleStreamEvent({ type: STREAM_EVENT_CITATIONS, data: citations }, deps);
    expect(deps.assistantMsg.citations).toEqual(citations);
    expect(deps.updateStreaming).toHaveBeenCalledWith({ citations });
  });

  it('handles multiple citations', () => {
    const citations: Citation[] = [makeCitation('abcd1234'), makeCitation('efgh5678')];
    const deps = makeDeps();
    handleStreamEvent({ type: STREAM_EVENT_CITATIONS, data: citations }, deps);
    expect(deps.assistantMsg.citations).toHaveLength(2);
    expect(deps.updateStreaming).toHaveBeenCalledTimes(1);
  });

  it('replaces any existing citations', () => {
    const deps = makeDeps();
    const first: Citation[] = [makeCitation('first1234')];
    const second: Citation[] = [makeCitation('seco5678')];
    handleStreamEvent({ type: STREAM_EVENT_CITATIONS, data: first }, deps);
    handleStreamEvent({ type: STREAM_EVENT_CITATIONS, data: second }, deps);
    expect(deps.assistantMsg.citations).toEqual(second);
  });
});

describe('handleStreamEvent — STREAM_EVENT_CITATION_CHECK', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores check on assistantMsg and calls updateStreaming', () => {
    const check: CitationCheck = {
      statements: [],
      unsupportedCount: 0,
      unknownCitationIds: [],
    };
    const deps = makeDeps();
    handleStreamEvent({ type: STREAM_EVENT_CITATION_CHECK, data: check }, deps);
    expect(deps.assistantMsg.citationCheck).toEqual(check);
    expect(deps.updateStreaming).toHaveBeenCalledWith({ citationCheck: check });
  });

  it('stores unsupported statements correctly', () => {
    const check: CitationCheck = {
      statements: [
        { text: 'The law is X.', citationIds: ['abcd1234'], supported: false, reason: 'Not found.' },
      ],
      unsupportedCount: 1,
      unknownCitationIds: [],
    };
    const deps = makeDeps();
    handleStreamEvent({ type: STREAM_EVENT_CITATION_CHECK, data: check }, deps);
    expect(deps.assistantMsg.citationCheck?.unsupportedCount).toBe(1);
    expect(deps.assistantMsg.citationCheck?.statements).toHaveLength(1);
  });

  it('handles empty check result', () => {
    const check: CitationCheck = { statements: [], unsupportedCount: 0, unknownCitationIds: [] };
    const deps = makeDeps();
    handleStreamEvent({ type: STREAM_EVENT_CITATION_CHECK, data: check }, deps);
    expect(deps.updateStreaming).toHaveBeenCalledWith({ citationCheck: check });
  });
});
