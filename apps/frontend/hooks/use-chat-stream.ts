import { useRef, useState, useCallback } from 'react';
import {
  chatService,
  type Message,
  type StreamMessageParams,
} from '@/services/chat.service';
import { UploadedFile } from '@/components/chat/file-upload';
import { ApprovalRequest } from '@/components/chat/approval-dialog';
import { useQueryCacheUpdater } from '@/hooks/use-query-cache-updater';
import { chatKeys } from '@/hooks/useChat';
import {
  handleStreamEvent,
  type ReasoningStep,
} from '@/hooks/use-stream-event-handler';
import { toast } from 'sonner';

interface StreamDeps {
  messages: Message[];
  refetchHistory: () => void;
  onStreamEnd?: () => void;
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

export const useChatStream = (deps: StreamDeps) => {
  const { refetchHistory, onStreamEnd } = deps;
  const cache = useQueryCacheUpdater();

  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaitingApproval, setIsWaitingApproval] = useState(false);
  const [approvalRequest, setApprovalRequest] =
    useState<ApprovalRequest | null>(null);

  // Local React state for the messages currently being streamed.
  // This bypasses TanStack Query's setTimeout(0) notification scheduler
  // so that every content chunk triggers an immediate re-render.
  const [streamingMessages, setStreamingMessages] = useState<Message[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isCreatingChatRef = useRef(false);
  const isStreamingRef = useRef(false);

  const handleApprove = useCallback(
    async (chatId: string | null, requestId: string) => {
      if (!chatId) return;
      try {
        await chatService.approveAction(chatId, requestId);
        setApprovalRequest(null);
        setIsWaitingApproval(false);
      } catch (err) {
        console.error('Failed to approve:', err);
        toast.error('Failed to approve action');
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
        toast.error('Failed to reject action');
      }
    },
    []
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const messagesRef = useRef<Message[]>(deps.messages);
  messagesRef.current = deps.messages;

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
        toast.warning('Please select a model first');
        return;
      }

      if (!currentChatId) {
        try {
          isCreatingChatRef.current = true;
          const newChat = await createChat({ agentId: selectedAgentId });
          currentChatId = newChat.id;
          // Pre-seed TQ cache with empty messages so useQuery doesn't
          // fire a server fetch that could race with the stream.
          cache.qc.setQueryData(chatKeys.messages(currentChatId), []);
          onChatCreated(currentChatId);
        } catch (err) {
          console.error('Failed to create chat:', err);
          isCreatingChatRef.current = false;
          return;
        }
      }

      const targetChatId = currentChatId;
      const allFileIds: string[] = files?.map((f) => f.id) ?? [];
      let finalRawFiles = rawFiles;

      const { platform } = await import('@/lib/platform');
      if (platform.isDesktop && rawFiles && rawFiles.length > 0) {
        try {
          for (const file of rawFiles) {
            const uploaded = await chatService.uploadAttachment(
              targetChatId,
              file
            );
            allFileIds.push(uploaded.id);
          }
          finalRawFiles = [];
        } catch (err) {
          console.error('Failed to pre-upload files locally:', err);
          toast.error('Failed to upload one or more files to workspace.');
          return;
        }
      }

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

      // Mutable refs so the event handler can update them; we spread from
      // these in setStreamingMessages to push immediate re-renders.
      const userMsgRef = { current: { ...userMsg } };
      const assistantRef = { current: { ...assistantMsg } };

      isStreamingRef.current = true;
      setStreamingMessages([
        { ...userMsgRef.current },
        { ...assistantRef.current },
      ]);
      setIsStreaming(true);

      const currentMessages = messagesRef.current;
      const streamParams: StreamMessageParams & { local_filenames?: string[] } =
        {
          chatId: targetChatId,
          messages: [
            ...currentMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            { role: 'user', content },
          ],
          agentId: selectedAgentId,
          modelId: selectedModelId,
          modelDbId: selectedModelDbId,
          modelProvider: selectedProvider,
          modelName: selectedModelName,
          fileIds: allFileIds.length > 0 ? allFileIds : undefined,
          files: finalRawFiles?.length ? finalRawFiles : undefined,
          local_filenames:
            platform.isDesktop && rawFiles?.length
              ? rawFiles.map((f) => f.name)
              : undefined,
        };

      const accumulator = { content: '', reasoning: [] as ReasoningStep[] };

      const updateStreaming = (patch: Partial<Message>) => {
        Object.assign(assistantRef.current, patch);
        setStreamingMessages([
          { ...userMsgRef.current },
          { ...assistantRef.current },
        ]);
      };

      try {
        abortControllerRef.current = new AbortController();

        for await (const event of chatService.streamMessage(
          streamParams,
          abortControllerRef.current.signal
        )) {
          handleStreamEvent(event, {
            targetChatId,
            assistantMsg: assistantRef.current,
            cache,
            accumulator,
            setApprovalRequest,
            setIsWaitingApproval,
            refetchHistory,
            userMsgId: userMsg.id,
            updateStreaming,
          });
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          console.log('Stream aborted by user');
        } else {
          console.error('Streaming failed:', error);
          updateStreaming({
            content: 'Error: Failed to get response. Please try again.',
            isStreaming: false,
          });
        }
      } finally {
        // Persist final state into TQ cache so it survives after streaming ends.
        // The done event may have assigned server IDs; apply them.
        const serverUserMsgId = (
          assistantRef.current as Record<string, unknown>
        ).__userMessageId as string | undefined;
        if (serverUserMsgId) {
          userMsgRef.current.id = serverUserMsgId;
        }
        const { __userMessageId: _, ...cleanAssistant } =
          assistantRef.current as Message & { __userMessageId?: string };
        cache.appendMessage(targetChatId, { ...userMsgRef.current });
        cache.appendMessage(targetChatId, {
          ...cleanAssistant,
          isStreaming: false,
        });

        // Delay clearing streaming state so TQ's setTimeout(0) notification
        // has time to propagate the cache update to observers. Without this,
        // there would be a brief flicker where messages disappear.
        setTimeout(() => {
          setStreamingMessages([]);
          setIsStreaming(false);
        }, 50);
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

        onStreamEnd?.();
      }
    },
    [cache, refetchHistory, onStreamEnd]
  );

  return {
    isStreaming,
    isWaitingApproval,
    approvalRequest,
    isCreatingChatRef,
    isStreamingRef,
    streamingMessages,
    sendMessage,
    stopStreaming,
    handleApprove,
    handleReject,
    patchArtifact: cache.patchArtifact,
  };
};
