import type {
  Message,
  Artifact,
  InlineTodo,
  SSEEvent,
} from '@/services/chat.service';
import { chatService } from '@/services/chat.service';
import {
  STREAM_EVENT_APPROVAL_REQUEST,
  STREAM_EVENT_ARTIFACT,
  STREAM_EVENT_ARTIFACT_STREAM,
  STREAM_EVENT_CLIENT_TOOL_REQUEST,
  STREAM_EVENT_CONTENT,
  STREAM_EVENT_DONE,
  STREAM_EVENT_ERROR,
  STREAM_EVENT_FILE_VERSION,
  STREAM_EVENT_PHASE_CHANGE,
  STREAM_EVENT_REASONING,
  STREAM_EVENT_START,
  STREAM_EVENT_TASK_COMPLETED,
  STREAM_EVENT_TASK_ERROR,
  STREAM_EVENT_TASK_PLANNED,
  STREAM_EVENT_TASK_STARTED,
  STREAM_EVENT_TODO,
  STREAM_EVENT_TOOL_CALL,
} from '@/constants/stream-events';
import { chatKeys } from '@/hooks/useChat';
import { platform } from '@/lib/platform';
import type { useQueryCacheUpdater } from './use-query-cache-updater';

const normalizeKey = (key: string | null | undefined): string => {
  if (!key) return '';
  return key
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
};

const normalizeArtifact = (data: unknown): Artifact => {
  const raw =
    data && typeof data === 'object' && 'artifact' in data
      ? (data as { artifact: Record<string, unknown> }).artifact
      : (data as Record<string, unknown>);

  if (!raw || typeof raw !== 'object') {
    return {
      id: '',
      title: null,
      type: 'TXT',
      seq: 0,
      content: '',
      filename: null,
      createdAt: new Date().toISOString(),
    };
  }

  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    title: r.title != null ? String(r.title) : null,
    type: String(r.type ?? 'TXT'),
    seq: Number(r.seq ?? 0),
    content: String(r.content ?? ''),
    filename: r.filename != null ? String(r.filename) : null,
    createdAt:
      typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    messageId: r.messageId != null ? String(r.messageId) : null,
    chatId: r.chatId != null ? String(r.chatId) : undefined,
    version: r.version != null ? Number(r.version) : undefined,
    url: r.url != null ? String(r.url) : null,
    metadata: r.metadata,
  };
};

export interface ReasoningStep {
  thought: string;
  toolCalls?: Array<{
    tool: string;
    input: Record<string, unknown>;
    output: string;
  }>;
}

interface StreamAccumulator {
  content: string;
  reasoning: ReasoningStep[];
}

type CacheOps = ReturnType<typeof useQueryCacheUpdater>;

interface EventHandlerDeps {
  targetChatId: string;
  assistantMsg: Message;
  cache: CacheOps;
  accumulator: StreamAccumulator;
  setApprovalRequest: (
    req: {
      request_id: string;
      tool_name: string;
      tool_input: Record<string, unknown>;
      description: string;
    } | null
  ) => void;
  setIsWaitingApproval: (v: boolean) => void;
  refetchHistory: () => void;
  userMsgId: string;
  /** Push a partial update to the streaming assistant message (React state). */
  updateStreaming: (patch: Partial<Message>) => void;
}

export const handleStreamEvent = (
  event: SSEEvent,
  deps: EventHandlerDeps
): void => {
  const {
    targetChatId,
    assistantMsg,
    cache,
    accumulator,
    setApprovalRequest,
    setIsWaitingApproval,
    refetchHistory,
    userMsgId,
    updateStreaming,
  } = deps;

  const upsertTodoOnMessage = (todo: InlineTodo) => {
    const currentTodos = assistantMsg.todos || [];
    const existingIdx = currentTodos.findIndex((t) => t.id === todo.id);
    if (existingIdx >= 0) {
      currentTodos[existingIdx] = { ...currentTodos[existingIdx], ...todo };
    } else {
      currentTodos.push(todo);
    }
    assistantMsg.todos = currentTodos;
    updateStreaming({ todos: [...currentTodos] });
  };

  switch (event.type) {
    case STREAM_EVENT_START:
    case STREAM_EVENT_PHASE_CHANGE:
      break;

    case STREAM_EVENT_TASK_PLANNED: {
      const d = event.data as {
        id: string;
        title: string;
        status: string;
        description?: string | null;
      };
      upsertTodoOnMessage({
        id: d.id,
        title: d.title,
        description: d.description,
        status: 'PENDING',
      });
      break;
    }

    case STREAM_EVENT_TASK_STARTED: {
      const d = event.data as { id: string; title: string; status: string };
      upsertTodoOnMessage({
        id: d.id,
        title: d.title,
        status: 'IN_PROGRESS',
      });
      break;
    }

    case STREAM_EVENT_TASK_COMPLETED: {
      const d = event.data as { id: string; title: string; status: string };
      upsertTodoOnMessage({
        id: d.id,
        title: d.title,
        status: 'COMPLETED',
      });
      break;
    }

    case STREAM_EVENT_TASK_ERROR: {
      const d = event.data as {
        id: string;
        title: string;
        status: string;
        error?: string;
      };
      upsertTodoOnMessage({
        id: d.id,
        title: d.title,
        status: 'ERROR',
      });
      break;
    }

    case STREAM_EVENT_CONTENT: {
      accumulator.content += event.data;
      updateStreaming({ content: accumulator.content });
      break;
    }

    case STREAM_EVENT_APPROVAL_REQUEST:
      setApprovalRequest({
        request_id: event.data.request_id,
        tool_name: event.data.tool_name,
        tool_input: event.data.tool_input,
        description: event.data.description ?? '',
      });
      setIsWaitingApproval(true);
      break;

    case STREAM_EVENT_CLIENT_TOOL_REQUEST: {
      const reqData = event.data as {
        request_id: string;
        tool_name: string;
        tool_input: Record<string, unknown>;
      };
      if (platform.isDesktop) {
        platform
          .executeTool(reqData.tool_name, reqData.tool_input)
          .then((result) => {
            chatService.postToolResult(
              targetChatId,
              reqData.request_id,
              result
            );
          })
          .catch((err: Error) => {
            chatService.postToolResult(
              targetChatId,
              reqData.request_id,
              JSON.stringify({ success: false, error: err.message })
            );
          });
      }
      break;
    }

    case STREAM_EVENT_REASONING: {
      const rawData = event.data as {
        thought?: string;
        tool_calls?: ReasoningStep['toolCalls'];
        toolCalls?: ReasoningStep['toolCalls'];
      };
      const step: ReasoningStep = {
        thought: rawData.thought ?? '',
        toolCalls: rawData.tool_calls ?? rawData.toolCalls,
      };
      if (
        (event as { isUpdate?: boolean }).isUpdate &&
        accumulator.reasoning.length > 0
      ) {
        accumulator.reasoning[accumulator.reasoning.length - 1] = step;
      } else {
        accumulator.reasoning.push(step);
      }
      updateStreaming({ reasoning: [...accumulator.reasoning] });
      break;
    }

    case STREAM_EVENT_TOOL_CALL: {
      for (let i = accumulator.reasoning.length - 1; i >= 0; i--) {
        const s = accumulator.reasoning[i];
        if (s.toolCalls && s.toolCalls[0]?.tool === event.data.tool) {
          s.toolCalls[0].output = event.data.output;
          break;
        }
      }
      updateStreaming({ reasoning: [...accumulator.reasoning] });
      break;
    }

    case STREAM_EVENT_ARTIFACT_STREAM: {
      const streamData = event.data as Record<string, unknown>;
      const fileKey = String(
        streamData.filename || streamData.title || 'Untitled'
      );
      const streamType = String(streamData.type || 'MD').toUpperCase();

      const currentArtifacts =
        cache.qc.getQueryData<Artifact[]>(chatKeys.artifacts(targetChatId)) ||
        [];

      // Match by filename/title AND type so MD and XLSX with similar names
      // don't collide.
      const existingIdx = currentArtifacts.findLastIndex(
        (a) =>
          (a.filename === fileKey || a.title === fileKey) &&
          (a.type || '').toUpperCase() === streamType
      );
      const newContent = String(streamData.content || '');

      if (existingIdx >= 0) {
        cache.patchArtifact(targetChatId, fileKey, { content: newContent });
        assistantMsg.artifacts = (assistantMsg.artifacts || []).map((a) =>
          (a.filename === fileKey || a.title === fileKey) &&
          (a.type || '').toUpperCase() === streamType
            ? { ...a, content: newContent }
            : a
        );
        updateStreaming({ artifacts: assistantMsg.artifacts });
      } else {
        const tempArtifact: Artifact = {
          id: `stream-art-${Date.now()}`,
          title: String(streamData.title || fileKey),
          filename: streamData.filename ? String(streamData.filename) : null,
          type: String(streamData.type || 'MD'),
          seq: currentArtifacts.length + 1,
          content: newContent,
          createdAt: new Date().toISOString(),
          messageId: assistantMsg.id,
          chatId: targetChatId,
        };
        cache.appendArtifact(targetChatId, tempArtifact);
        assistantMsg.artifacts = [
          ...(assistantMsg.artifacts ?? []),
          tempArtifact,
        ];
        updateStreaming({ artifacts: assistantMsg.artifacts });
      }
      break;
    }

    case STREAM_EVENT_ARTIFACT: {
      const artifact = normalizeArtifact(event.data);
      if (!artifact.id) break;

      const fileKey = artifact.filename || artifact.title;
      const normalizedFileKey = normalizeKey(fileKey);
      const artType = (artifact.type || '').toUpperCase();

      // Match by exact filename/title OR by normalized key + same type.
      // Different file types (MD vs XLSX) must never be treated as the same artifact.
      const existingIdx = (assistantMsg.artifacts || []).findIndex((a) => {
        const exactMatch = a.filename === fileKey || a.title === fileKey;
        if (exactMatch) return true;
        const aKey = normalizeKey(a.filename) || normalizeKey(a.title);
        const aType = (a.type || '').toUpperCase();
        return (
          aKey === normalizedFileKey &&
          normalizedFileKey !== '' &&
          aType === artType
        );
      });

      if (existingIdx >= 0) {
        const tempKey =
          assistantMsg.artifacts![existingIdx]?.filename ||
          assistantMsg.artifacts![existingIdx]?.title;
        assistantMsg.artifacts![existingIdx] = artifact;
        cache.patchArtifact(targetChatId, tempKey!, { ...artifact });
      } else {
        cache.appendArtifact(targetChatId, artifact);
        assistantMsg.artifacts = [...(assistantMsg.artifacts ?? []), artifact];
      }
      updateStreaming({ artifacts: assistantMsg.artifacts });
      break;
    }

    case STREAM_EVENT_FILE_VERSION: {
      const { filename, version, url } = event.data;
      if (filename)
        cache.patchArtifact(targetChatId, filename, { version, url });
      break;
    }

    case STREAM_EVENT_TODO: {
      const todoData = event.data as unknown as InlineTodo;
      upsertTodoOnMessage(todoData);
      break;
    }

    case STREAM_EVENT_DONE: {
      const finalContent = accumulator.content || event.data?.content || '';
      if (event.messageId) {
        assistantMsg.id = event.messageId;
      }
      if (event.userMessageId) {
        (assistantMsg as unknown as Record<string, unknown>).__userMessageId =
          event.userMessageId;
      }
      updateStreaming({
        content: finalContent,
        isStreaming: false,
        ...(event.messageId ? { id: event.messageId } : {}),
      });

      setIsWaitingApproval(false);
      setApprovalRequest(null);

      setTimeout(() => {
        if (platform.isWeb) {
          cache.qc.invalidateQueries({
            queryKey: chatKeys.artifacts(targetChatId),
          });
        }
        refetchHistory();
      }, 100);
      break;
    }

    case STREAM_EVENT_ERROR:
      console.error('Stream error event:', event.data);
      break;
  }
};
