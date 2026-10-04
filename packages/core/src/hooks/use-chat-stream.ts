import { useRef, useState, useCallback } from 'react';
import {
  chatService,
  streamMessage,
  type Message,
  type ReasoningStep,
  type StreamMessageParams,
  type TimelineItem,
} from '../services/chat.service';
import type { GitContext, MessageAttachment } from '../types/chat';
import { platform } from '@vivexy/core/lib/platform';
import { UploadedFile } from '@vivexy/core/chat/file-upload';
import { ApprovalRequest } from '@vivexy/core/chat/approval-dialog';
import { FormQuestionRequest } from '@vivexy/core/chat/form-question-card';
import { useQueryCacheUpdater } from './use-query-cache-updater';
import { chatKeys } from './useChat';
import { handleStreamEvent } from './use-stream-event-handler';
import { toast } from 'sonner';

interface StreamDeps {
  messages: Message[];
  refetchHistory: () => void;
  onStreamEnd?: () => void;
  setStreamingMessages: (msgs: Message[]) => void;
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
  githubContext?: GitContext | null;
  onChatCreated: (id: string) => void;
  createChat: (params: { agentId: string }) => Promise<{ id: string }>;
  /** Called once the server-assigned user message ID is known (after stream completes). */
  onUserMessageReady?: (userMessageId: string) => void;
}

export const useChatStream = (deps: StreamDeps) => {
  const { refetchHistory, onStreamEnd, setStreamingMessages } = deps;
  const cache = useQueryCacheUpdater();

  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaitingApproval, setIsWaitingApproval] = useState(false);
  const [approvalRequest, setApprovalRequest] =
    useState<ApprovalRequest | null>(null);
  const [formQuestion, setFormQuestion] = useState<FormQuestionRequest | null>(
    null
  );

  // chatId is needed to post form answers; captured per-stream in a ref
  const activeChatIdRef = useRef<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isCreatingChatRef = useRef(false);
  const isStreamingRef = useRef(false);
  const serverUserMsgIdRef = useRef<string | undefined>(undefined);

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

  const handleFormSubmit = useCallback(
    async (requestId: string, answers: Record<string, unknown>) => {
      const chatId = activeChatIdRef.current;
      if (!chatId) return;
      try {
        await chatService.postToolResult(
          chatId,
          requestId,
          JSON.stringify(answers)
        );
        setFormQuestion(null);
      } catch (err) {
        console.error('Failed to submit form:', err);
        toast.error('Failed to submit form answers');
      }
    },
    []
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const messagesRef = useRef<Message[]>(deps.messages);
  messagesRef.current = deps.messages;

  const setStreamingMessagesRef = useRef(setStreamingMessages);
  setStreamingMessagesRef.current = setStreamingMessages;

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
          cache.qc.setQueryData(chatKeys.messages(currentChatId), []);
          onChatCreated(currentChatId);
        } catch (err) {
          console.error('Failed to create chat:', err);
          isCreatingChatRef.current = false;
          return;
        }
      }

      const targetChatId = currentChatId;
      activeChatIdRef.current = targetChatId;
      const allFileIds: string[] = files?.map((f) => f.id) ?? [];
      let finalRawFiles = rawFiles;

      // Collect attachment metadata for the temp user message shown during streaming
      const tempAttachments: MessageAttachment[] =
        files?.map((f) => ({
          id: f.id,
          chatId: targetChatId,
          messageId: null,
          filename: f.filename,
          mimeType: f.mimeType,
          size: f.size,
          createdAt: new Date().toISOString(),
        })) ?? [];

      if (platform.isDesktop && rawFiles && rawFiles.length > 0) {
        try {
          for (const file of rawFiles) {
            const uploaded = await chatService.uploadAttachment(
              targetChatId,
              file
            );
            allFileIds.push(uploaded.id);
            tempAttachments.push({
              id: uploaded.id,
              chatId: targetChatId,
              messageId: null,
              filename: uploaded.filename,
              mimeType: uploaded.mimeType,
              size: uploaded.size,
              createdAt: new Date().toISOString(),
            });
          }
          finalRawFiles = [];
        } catch (err) {
          console.error('Failed to pre-upload files locally:', err);
          toast.error('Failed to upload one or more files to workspace.');
          return;
        }
      } else if (rawFiles?.length) {
        // Web: backend will upload these; show placeholder chips during streaming
        rawFiles.forEach((file, i) => {
          tempAttachments.push({
            id: `temp-attach-${Date.now()}-${i}`,
            chatId: targetChatId,
            messageId: null,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            createdAt: new Date().toISOString(),
          });
        });
      }

      const userMsg: Message = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
        attachments: tempAttachments.length > 0 ? tempAttachments : undefined,
      };
      const assistantMsg: Message = {
        id: `temp-assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        isStreaming: true,
        reasoning: [],
        timeline: [],
        createdAt: new Date().toISOString(),
      };

      const userMsgRef = { current: { ...userMsg } };
      const assistantRef = { current: { ...assistantMsg } };

      const push = () => {
        setStreamingMessagesRef.current([
          { ...userMsgRef.current },
          { ...assistantRef.current },
        ]);
      };

      isStreamingRef.current = true;
      setIsStreaming(true);
      push();

      const updateStreaming = (patch: Partial<Message>) => {
        Object.assign(assistantRef.current, patch);
        push();
      };

      const currentMessages = messagesRef.current;
      const { githubContext } = params;

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
          githubContext: githubContext ?? undefined,
          local_filenames:
            platform.isDesktop && rawFiles?.length
              ? rawFiles.map((f) => f.name)
              : undefined,
        };

      const accumulator = {
        content: '',
        reasoning: [] as ReasoningStep[],
        timeline: [] as TimelineItem[],
      };

      try {
        abortControllerRef.current = new AbortController();

        const eventHandlerDeps = {
          targetChatId,
          assistantMsg: assistantRef.current,
          cache,
          accumulator,
          setApprovalRequest,
          setIsWaitingApproval,
          setFormQuestion,
          refetchHistory,
          userMsgId: userMsg.id,
          onUserMessageIdReceived: (id: string) => {
            serverUserMsgIdRef.current = id;
          },
          updateStreaming,
        };

        await streamMessage(
          streamParams,
          (event) => {
            handleStreamEvent(event, eventHandlerDeps);
          },
          abortControllerRef.current.signal
        );
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
        if (serverUserMsgIdRef.current) {
          userMsgRef.current.id = serverUserMsgIdRef.current;
          params.onUserMessageReady?.(serverUserMsgIdRef.current);
          serverUserMsgIdRef.current = undefined;
        }

        cache.appendMessage(targetChatId, { ...userMsgRef.current });
        cache.appendMessage(targetChatId, {
          ...assistantRef.current,
          isStreaming: false,
        });

        setTimeout(() => {
          setStreamingMessagesRef.current([]);
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
    formQuestion,
    isCreatingChatRef,
    isStreamingRef,
    sendMessage,
    stopStreaming,
    handleApprove,
    handleReject,
    handleFormSubmit,
    patchArtifact: cache.patchArtifact,
  };
};
