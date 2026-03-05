import { useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  chatService,
  Message,
  Artifact,
  Todo,
  StreamMessageParams,
} from '@/services/chat.service';
import { chatKeys } from '@/hooks/useChat';
import { UploadedFile } from '@/components/chat/file-upload';
import { ApprovalRequest } from '@/components/chat/approval-dialog';

// ---------------------------------------------------------------------------
// Reasoning step shape (local — not persisted to the service)
// ---------------------------------------------------------------------------

interface ReasoningStep {
  thought: string;
  toolCalls?: Array<{
    tool: string;
    input: Record<string, unknown>;
    output: string;
  }>;
}

// ---------------------------------------------------------------------------
// Hook inputs
// ---------------------------------------------------------------------------

interface StreamDeps {
  /** Read-only snapshot of current messages (used to build the request payload) */
  messages: Message[];
  /** Invalidate chat list after a stream completes (so new titles appear) */
  refetchHistory: () => void;
}

export interface SendMessageParams {
  content: string;
  files?: UploadedFile[];
  rawFiles?: File[];
  chatId: string | null;
  selectedAgentId: string;
  selectedModelId: string | null;
  selectedModelDbId: string | null;
  selectedProvider: string;
  selectedModelName: string;
  onChatCreated: (id: string) => void;
  createChat: (params: { agentId: string }) => Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Artifact normalizer
// ---------------------------------------------------------------------------

function normalizeArtifact(data: unknown): Artifact {
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
    metadata: r.metadata,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatStream(deps: StreamDeps) {
  const { refetchHistory } = deps;
  const qc = useQueryClient();

  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaitingApproval, setIsWaitingApproval] = useState(false);
  const [approvalRequest, setApprovalRequest] =
    useState<ApprovalRequest | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isCreatingChatRef = useRef(false);
  const isStreamingRef = useRef(false);

  // ---- Cache patchers bound to dynamic chatId ----

  const appendMessage = useCallback(
    (chatId: string, msg: Message) => {
      qc.setQueryData<Message[]>(chatKeys.messages(chatId), (prev = []) => [
        ...prev,
        msg,
      ]);
    },
    [qc]
  );

  const patchMessage = useCallback(
    (chatId: string, id: string, patch: Partial<Message>) => {
      qc.setQueryData<Message[]>(chatKeys.messages(chatId), (prev = []) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
      );
    },
    [qc]
  );

  const appendArtifact = useCallback(
    (chatId: string, artifact: Artifact) => {
      qc.setQueryData<Artifact[]>(chatKeys.artifacts(chatId), (prev = []) => [
        ...prev,
        artifact,
      ]);
    },
    [qc]
  );

  const patchArtifact = useCallback(
    (chatId: string, filenameOrTitle: string, patch: Partial<Artifact>) => {
      qc.setQueryData<Artifact[]>(chatKeys.artifacts(chatId), (prev = []) => {
        const idx = prev.findLastIndex(
          (a) => a.filename === filenameOrTitle || a.title === filenameOrTitle
        );
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...patch };
        return updated;
      });
    },
    [qc]
  );

  const upsertTodo = useCallback(
    (chatId: string, todo: Todo) => {
      qc.setQueryData<Todo[]>(chatKeys.todos(chatId), (prev = []) => {
        const exists = prev.find((t) => t.id === todo.id);
        if (exists)
          return prev.map((t) => (t.id === todo.id ? { ...t, ...todo } : t));
        return [...prev, todo];
      });
    },
    [qc]
  );

  // ---- Approval (delegated to chatService) ----

  const handleApprove = useCallback(
    async (chatId: string | null, requestId: string) => {
      if (!chatId) return;
      try {
        await chatService.approveAction(chatId, requestId);
        setApprovalRequest(null);
        setIsWaitingApproval(false);
      } catch (err) {
        console.error('Failed to approve:', err);
        alert('Failed to approve action');
      }
    },
    []
  );

  const handleReject = useCallback(
    async (chatId: string | null, requestId: string) => {
      if (!chatId) return;
      try {
        await chatService.rejectAction(chatId, requestId);
        setApprovalRequest(null);
        setIsWaitingApproval(false);
      } catch (err) {
        console.error('Failed to reject:', err);
        alert('Failed to reject action');
      }
    },
    []
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // ---- Send ----

  const sendMessage = useCallback(
    async (params: SendMessageParams) => {
      const {
        content,
        files,
        rawFiles,
        selectedAgentId,
        selectedModelId,
        selectedModelDbId,
        selectedProvider,
        selectedModelName,
        onChatCreated,
        createChat,
      } = params;
      let currentChatId = params.chatId;

      if (!content.trim() && !files?.length && !rawFiles?.length) return;
      if (!selectedModelDbId) {
        alert('Please select a model first');
        return;
      }

      // Create chat on-demand
      if (!currentChatId) {
        try {
          isCreatingChatRef.current = true;
          const newChat = await createChat({ agentId: selectedAgentId });
          currentChatId = newChat.id;
          onChatCreated(currentChatId);
        } catch (err) {
          console.error('Failed to create chat:', err);
          isCreatingChatRef.current = false;
          return;
        }
      }

      // Capture the *active* target chatId for the closure
      const targetChatId = currentChatId;

      // Note: raw files are no longer uploaded sequentially here!
      // They are passed to streamMessage, which attaches them as multipart/form-data.
      // The backend will upload them concurrently before starting the agent stream.
      const allFileIds: string[] = files?.map((f) => f.id) ?? [];

      // Optimistic messages — injected directly into the TQ cache using active targetChatId
      const userMsg: Message = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };
      const assistantMsg: Message = {
        id: `temp-assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        isStreaming: true,
        reasoning: [],
        createdAt: new Date().toISOString(),
      };

      isStreamingRef.current = true;
      flushSync(() => {
        appendMessage(targetChatId, userMsg);
        appendMessage(targetChatId, assistantMsg);
        setIsStreaming(true);
      });

      // Build request payload
      const streamParams: StreamMessageParams = {
        chatId: targetChatId,
        messages: [
          ...deps.messages.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content },
        ],
        agentId: selectedAgentId,
        modelId: selectedModelId,
        modelDbId: selectedModelDbId,
        modelProvider: selectedProvider,
        modelName: selectedModelName,
        fileIds: allFileIds.length > 0 ? allFileIds : undefined,
        files: rawFiles?.length ? rawFiles : undefined,
      };

      // Accumulate state that spans multiple events
      let accumulatedContent = '';
      const accumulatedReasoning: ReasoningStep[] = [];

      try {
        abortControllerRef.current = new AbortController();

        for await (const event of chatService.streamMessage(
          streamParams,
          abortControllerRef.current.signal
        )) {
          switch (event.type) {
            case 'content': {
              accumulatedContent += event.data;
              flushSync(() =>
                patchMessage(targetChatId, assistantMsg.id, {
                  content: accumulatedContent,
                })
              );
              break;
            }

            case 'approval_request':
              setApprovalRequest({
                request_id: event.data.request_id,
                tool_name: event.data.tool_name,
                tool_input: event.data.tool_input,
                description: event.data.description ?? '',
              });
              setIsWaitingApproval(true);
              break;

            case 'reasoning': {
              const rawData = event.data as {
                thought?: string;
                tool_calls?: ReasoningStep['toolCalls'];
                toolCalls?: ReasoningStep['toolCalls'];
              };
              const step: ReasoningStep = {
                thought: rawData.thought ?? '',
                toolCalls: rawData.tool_calls ?? rawData.toolCalls,
              };
              if (event.isUpdate && accumulatedReasoning.length > 0) {
                accumulatedReasoning[accumulatedReasoning.length - 1] = step;
              } else {
                accumulatedReasoning.push(step);
              }
              flushSync(() =>
                patchMessage(targetChatId, assistantMsg.id, {
                  reasoning: [...accumulatedReasoning],
                })
              );
              break;
            }

            case 'tool_call': {
              for (let i = accumulatedReasoning.length - 1; i >= 0; i--) {
                const s = accumulatedReasoning[i];
                if (s.toolCalls && s.toolCalls[0]?.tool === event.data.tool) {
                  s.toolCalls[0].output = event.data.output;
                  break;
                }
              }
              patchMessage(targetChatId, assistantMsg.id, {
                reasoning: [...accumulatedReasoning],
              });
              break;
            }

            case 'artifact_stream': {
              const streamData = event.data as Record<string, unknown>;
              const fileKey = String(
                streamData.filename || streamData.title || 'Untitled'
              );

              const currentArtifacts =
                qc.getQueryData<Artifact[]>(chatKeys.artifacts(targetChatId)) ||
                [];
              const existingIdx = currentArtifacts.findLastIndex(
                (a) => a.filename === fileKey || a.title === fileKey
              );
              const newContent = String(streamData.content || '');

              if (existingIdx >= 0) {
                flushSync(() => {
                  patchArtifact(targetChatId, fileKey, { content: newContent });
                  assistantMsg.artifacts = (assistantMsg.artifacts || []).map(
                    (a) =>
                      a.filename === fileKey || a.title === fileKey
                        ? { ...a, content: newContent }
                        : a
                  );
                  patchMessage(targetChatId, assistantMsg.id, {
                    artifacts: assistantMsg.artifacts,
                  });
                });
              } else {
                const tempArtifact: Artifact = {
                  id: `stream-art-${Date.now()}`,
                  title: String(streamData.title || fileKey),
                  filename: streamData.filename
                    ? String(streamData.filename)
                    : null,
                  type: String(streamData.type || 'MD'),
                  seq: currentArtifacts.length + 1,
                  content: newContent,
                  createdAt: new Date().toISOString(),
                  messageId: assistantMsg.id,
                };
                flushSync(() => {
                  appendArtifact(targetChatId, tempArtifact);
                  assistantMsg.artifacts = [
                    ...(assistantMsg.artifacts ?? []),
                    tempArtifact,
                  ];
                  patchMessage(targetChatId, assistantMsg.id, {
                    artifacts: assistantMsg.artifacts,
                  });
                });
              }
              break;
            }

            case 'artifact': {
              const artifact = normalizeArtifact(event.data);
              if (!artifact.id) break;
              flushSync(() => {
                const fileKey = artifact.filename || artifact.title;
                const existingIdx = (assistantMsg.artifacts || []).findIndex(
                  (a) => a.filename === fileKey || a.title === fileKey
                );

                if (existingIdx >= 0) {
                  // Replace temporary with final
                  assistantMsg.artifacts![existingIdx] = artifact;
                  patchArtifact(targetChatId, fileKey!, { ...artifact });
                } else {
                  appendArtifact(targetChatId, artifact);
                  assistantMsg.artifacts = [
                    ...(assistantMsg.artifacts ?? []),
                    artifact,
                  ];
                }
                patchMessage(targetChatId, assistantMsg.id, {
                  artifacts: assistantMsg.artifacts,
                });
              });
              break;
            }

            case 'file_version': {
              const { filename, version, url } = event.data;
              if (filename)
                patchArtifact(targetChatId, filename, { version, url });
              break;
            }

            case 'todo':
              upsertTodo(targetChatId, event.data as unknown as Todo);
              break;

            case 'done': {
              const finalContent =
                accumulatedContent || event.data?.content || '';
              flushSync(() => {
                patchMessage(targetChatId, assistantMsg.id, {
                  content: finalContent,
                  isStreaming: false,
                  ...(event.messageId ? { id: event.messageId } : {}),
                });
                if (event.userMessageId) {
                  patchMessage(targetChatId, userMsg.id, {
                    id: event.userMessageId,
                  });
                }
              });
              setIsWaitingApproval(false);
              setApprovalRequest(null);

              // Invalidate the chat data to trigger a background refetch returning true state
              qc.invalidateQueries({
                queryKey: chatKeys.messages(targetChatId),
              });
              qc.invalidateQueries({
                queryKey: chatKeys.artifacts(targetChatId),
              });
              qc.invalidateQueries({ queryKey: chatKeys.todos(targetChatId) });

              refetchHistory();
              break;
            }

            case 'error':
              console.error('Stream error event:', event.data);
              break;
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          console.log('Stream aborted by user');
        } else {
          console.error('Streaming failed:', error);
          patchMessage(targetChatId, assistantMsg.id, {
            content: 'Error: Failed to get response. Please try again.',
            isStreaming: false,
          });
        }
      } finally {
        flushSync(() => setIsStreaming(false));
        abortControllerRef.current = null;

        if (currentChatId) {
          const url = new URL(window.location.href);
          if (url.searchParams.get('id') !== currentChatId) {
            url.searchParams.set('id', currentChatId);
            window.history.replaceState({}, '', url.pathname + url.search);
          }
        }

        isStreamingRef.current = false;
        isCreatingChatRef.current = false;
      }
    },
    [
      deps.messages,
      appendMessage,
      patchMessage,
      appendArtifact,
      patchArtifact,
      upsertTodo,
      refetchHistory,
      qc,
    ]
  );

  return {
    isStreaming,
    isWaitingApproval,
    approvalRequest,
    isCreatingChatRef,
    isStreamingRef,
    sendMessage,
    stopStreaming,
    handleApprove,
    handleReject,
  };
}
