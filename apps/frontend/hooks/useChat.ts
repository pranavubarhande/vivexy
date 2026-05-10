import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  chatService,
  Chat,
  Message,
  Artifact,
  LLMModel,
  Checkpoint,
} from '@/services/chat.service';
import { toast } from 'sonner';
import { artifactApi } from '@/services/chat/artifact-api';
import { platform } from '@/lib/platform';

// ---------------------------------------------------------------------------
// Query keys — single source of truth
// ---------------------------------------------------------------------------
export const chatKeys = {
  all: ['chats'] as const,
  list: () => [...chatKeys.all, 'list'] as const,
  detail: (id: string) => [...chatKeys.all, 'detail', id] as const,
  messages: (id: string) => [...chatKeys.all, id, 'messages'] as const,
  artifacts: (id: string) => [...chatKeys.all, id, 'artifacts'] as const,
  models: () => ['models'] as const,
};

// ---------------------------------------------------------------------------
// Chat List
// ---------------------------------------------------------------------------
export const useChatHistory = () => {
  const qc = useQueryClient();

  const { data: chats = [], isLoading } = useQuery({
    queryKey: chatKeys.list(),
    queryFn: () => chatService.getChats(),
    staleTime: 30_000,
  });

  const deleteChatMutation = useMutation({
    mutationFn: (id: string) => chatService.deleteChat(id),
    onSuccess: (_, id) => {
      qc.setQueryData<Chat[]>(chatKeys.list(), (prev = []) =>
        prev.filter((c) => c.id !== id)
      );
    },
  });

  const createChatMutation = useMutation({
    mutationFn: ({ agentId }: { agentId: string; title?: string }) =>
      chatService.createChat(agentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });

  return {
    chats,
    isLoading,
    /** Refetch chat list (e.g. after a message flow names the chat) */
    refetchHistory: () => qc.invalidateQueries({ queryKey: chatKeys.list() }),
    deleteChat: deleteChatMutation.mutateAsync,
    createChat: createChatMutation.mutateAsync,
    /** Optimistically remove a chat from local cache */
    removeChatFromCache: (id: string) => {
      qc.setQueryData<Chat[]>(chatKeys.list(), (prev = []) =>
        prev.filter((c) => c.id !== id)
      );
    },
  };
};

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
export const useModels = () => {
  const { data: models = [], isLoading } = useQuery<LLMModel[]>({
    queryKey: chatKeys.models(),
    queryFn: () => chatService.getModels(),
    staleTime: 5 * 60_000, // Models rarely change — 5 min stale
  });

  return { models, isLoading };
};

// ---------------------------------------------------------------------------
// Single chat: messages, artifacts, todos
// ---------------------------------------------------------------------------
export const useChat = (chatId?: string) => {
  const qc = useQueryClient();

  // In Electron mode, artifacts and todos are local-only (stored via SSE
  // events in the TQ cache). We must NOT refetch from the server because
  // the server returns empty arrays and would wipe the cache.
  const isDesktop = platform.isDesktop;

  const messagesQuery = useQuery<Message[]>({
    queryKey: chatKeys.messages(chatId!),
    queryFn: () => chatService.getChatMessages(chatId!),
    enabled: !!chatId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const artifactsQuery = useQuery<Artifact[]>({
    queryKey: chatKeys.artifacts(chatId!),
    queryFn: isDesktop
      ? async () => {
          // Load from local filesystem via IPC (persists across refresh)
          const local = await platform.listArtifacts(chatId!);
          // Merge with any existing cache data (from current streaming session)
          const cached =
            qc.getQueryData<Artifact[]>(chatKeys.artifacts(chatId!)) ?? [];
          // Use cached items first (more up-to-date), then add local-only items
          const cachedIds = new Set(cached.map((a) => a.id));
          const merged = [...cached];
          for (const item of local as Artifact[]) {
            if (!cachedIds.has(item.id)) {
              merged.push(item);
            }
          }
          return merged;
        }
      : () => chatService.getChatArtifacts(chatId!),
    enabled: !!chatId,
    staleTime: isDesktop ? Infinity : 5000,
    placeholderData: [],
  });

  const chatDetailQuery = useQuery<Chat>({
    queryKey: chatKeys.detail(chatId!),
    queryFn: () => chatService.getChat(chatId!),
    enabled: !!chatId,
    staleTime: 30_000,
  });

  const createArtifactMutation = useMutation({
    mutationFn: (data: {
      title?: string;
      type: string;
      filename?: string;
      language?: string;
      content: string;
      seq?: number;
    }) => chatService.createArtifact(chatId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.artifacts(chatId!) });
    },
  });

  const exportArtifactMutation = useMutation({
    mutationFn: ({
      artifactId,
      format,
      content,
    }: {
      artifactId: string;
      format: 'pdf' | 'docx';
      content?: string;
    }) => {
      // In Electron mode, use content-based export since artifact isn't in server DB
      if (isDesktop && content) {
        return chatService.exportContent(chatId!, content, format);
      }
      return chatService.exportArtifact(chatId!, artifactId, format);
    },
  });

  const revertMutation = useMutation({
    mutationFn: ({
      messageId,
      deleteSelf,
    }: {
      messageId: string;
      deleteSelf?: boolean;
    }) => chatService.revertToMessage(chatId!, messageId, deleteSelf),
    onSuccess: (_, { messageId, deleteSelf }) => {
      qc.setQueryData<Message[]>(chatKeys.messages(chatId!), (prev = []) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        if (idx < 0) return prev;
        return deleteSelf ? prev.slice(0, idx) : prev.slice(0, idx + 1);
      });
    },
  });

  const checkpointsQuery = useQuery<Checkpoint[]>({
    queryKey: [...chatKeys.messages(chatId!), 'checkpoints'],
    queryFn: () => chatService.getCheckpoints(chatId!),
    enabled: !!chatId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const restoreCheckpointMutation = useMutation({
    mutationFn: (checkpointId: string) =>
      chatService.restoreCheckpoint(chatId!, checkpointId),
    onSuccess: (data) => {
      qc.setQueryData<Message[]>(chatKeys.messages(chatId!), (prev = []) => {
        const idx = prev.findIndex((m) => m.id === data.checkpointMessageId);
        return idx >= 0 ? prev.slice(0, idx + 1) : prev;
      });
      qc.invalidateQueries({
        queryKey: [...chatKeys.messages(chatId!), 'checkpoints'],
      });
      toast.success('Restored to checkpoint');
    },
    onError: () => toast.error('Failed to restore checkpoint'),
  });

  function invalidateChatData() {
    if (!chatId) return;
    qc.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
    if (!isDesktop) {
      qc.invalidateQueries({ queryKey: chatKeys.artifacts(chatId) });
    }
  }

  return {
    messages: messagesQuery.data ?? [],
    artifacts: artifactsQuery.data ?? [],
    chatDetail: chatDetailQuery.data ?? null,

    isLoadingMessages: messagesQuery.isLoading,
    isLoadingArtifacts: artifactsQuery.isLoading,

    revertToMessage: revertMutation.mutateAsync,
    isReverting: revertMutation.isPending,
    createArtifact: createArtifactMutation.mutateAsync,
    exportArtifact: exportArtifactMutation.mutateAsync,
    isExporting: exportArtifactMutation.isPending,

    checkpoints: checkpointsQuery.data ?? [],
    isLoadingCheckpoints: checkpointsQuery.isLoading,
    restoreCheckpoint: restoreCheckpointMutation.mutateAsync,
    isRestoringCheckpoint: restoreCheckpointMutation.isPending,

    invalidateChatData,
  };
};

// ---------------------------------------------------------------------------
// File upload (used by file-upload.tsx)
// ---------------------------------------------------------------------------
export const useFileUpload = (chatId?: string) => {
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!chatId) throw new Error('No chat ID provided');
      setIsUploading(true);
      try {
        return await chatService.uploadAttachment(chatId, file);
      } finally {
        setIsUploading(false);
      }
    },
    [chatId]
  );

  return { uploadFile, isUploading };
};

// ---------------------------------------------------------------------------
// XLSX artifact content — fetches binary from proxy, parses with SheetJS
// ---------------------------------------------------------------------------
const parseXlsxBuffer = async (buf: ArrayBuffer): Promise<string> => {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const name of wb.SheetNames) {
    result[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
  }
  return JSON.stringify(result);
};

export { parseXlsxBuffer };

export const useXlsxContent = (chatId?: string, artifactId?: string) => {
  return useQuery({
    queryKey: ['xlsx-content', chatId, artifactId],
    queryFn: async () => {
      const buf = await artifactApi.downloadArtifact(chatId!, artifactId!);
      return parseXlsxBuffer(buf);
    },
    enabled: !!chatId && !!artifactId,
    staleTime: 5 * 60_000,
    retry: 1,
  });
};
