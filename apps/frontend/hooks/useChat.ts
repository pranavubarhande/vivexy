import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  chatService,
  Chat,
  Message,
  Artifact,
  Todo,
  LLMModel,
} from '@/services/chat.service';

// ---------------------------------------------------------------------------
// Query keys — single source of truth
// ---------------------------------------------------------------------------
export const chatKeys = {
  all: ['chats'] as const,
  list: () => [...chatKeys.all, 'list'] as const,
  detail: (id: string) => [...chatKeys.all, 'detail', id] as const,
  messages: (id: string) => [...chatKeys.all, id, 'messages'] as const,
  artifacts: (id: string) => [...chatKeys.all, id, 'artifacts'] as const,
  todos: (id: string) => [...chatKeys.all, id, 'todos'] as const,
  models: () => ['models'] as const,
};

// ---------------------------------------------------------------------------
// Chat List
// ---------------------------------------------------------------------------
export function useChatHistory() {
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
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
export function useModels() {
  const { data: models = [], isLoading } = useQuery<LLMModel[]>({
    queryKey: chatKeys.models(),
    queryFn: () => chatService.getModels(),
    staleTime: 5 * 60_000, // Models rarely change — 5 min stale
  });

  return { models, isLoading };
}

// ---------------------------------------------------------------------------
// Single chat: messages, artifacts, todos
// ---------------------------------------------------------------------------
export function useChat(chatId?: string) {
  const qc = useQueryClient();

  const messagesQuery = useQuery<Message[]>({
    queryKey: chatKeys.messages(chatId!),
    queryFn: () => chatService.getChatMessages(chatId!),
    enabled: !!chatId,
    // Keep stale for a few seconds so that immediately after a stream redirect
    // it doesn't instantly refetch and wipe optimistic updates
    staleTime: 5000,
  });

  const artifactsQuery = useQuery<Artifact[]>({
    queryKey: chatKeys.artifacts(chatId!),
    queryFn: () => chatService.getChatArtifacts(chatId!),
    enabled: !!chatId,
    staleTime: 5000,
  });

  const todosQuery = useQuery<Todo[]>({
    queryKey: chatKeys.todos(chatId!),
    queryFn: () => chatService.getChatTodos(chatId!),
    enabled: !!chatId,
    staleTime: 5000,
  });

  const chatDetailQuery = useQuery<Chat>({
    queryKey: chatKeys.detail(chatId!),
    queryFn: () => chatService.getChat(chatId!),
    enabled: !!chatId,
    staleTime: 30_000,
  });

  const updateTodoMutation = useMutation({
    mutationFn: ({
      todoId,
      status,
    }: {
      todoId: string;
      status: Todo['status'];
    }) => chatService.updateTodoStatus(chatId!, todoId, status),
    onSuccess: (updatedTodo) => {
      qc.setQueryData<Todo[]>(chatKeys.todos(chatId!), (prev = []) =>
        prev.map((t) => (t.id === updatedTodo.id ? updatedTodo : t))
      );
    },
  });

  const revertMutation = useMutation({
    mutationFn: (messageId: string) =>
      chatService.revertToMessage(chatId!, messageId),
    onSuccess: (_, messageId) => {
      qc.setQueryData<Message[]>(chatKeys.messages(chatId!), (prev = []) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        return idx >= 0 ? prev.slice(0, idx + 1) : prev;
      });
    },
  });

  // ---- Streaming helpers: update cache from SSE events ----

  function appendMessage(msg: Message) {
    qc.setQueryData<Message[]>(chatKeys.messages(chatId!), (prev = []) => [
      ...prev,
      msg,
    ]);
  }

  function patchMessage(id: string, patch: Partial<Message>) {
    qc.setQueryData<Message[]>(chatKeys.messages(chatId!), (prev = []) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }

  function appendArtifact(artifact: Artifact) {
    qc.setQueryData<Artifact[]>(chatKeys.artifacts(chatId!), (prev = []) => [
      ...prev,
      artifact,
    ]);
  }

  function patchArtifact(filename: string, patch: Partial<Artifact>) {
    qc.setQueryData<Artifact[]>(chatKeys.artifacts(chatId!), (prev = []) => {
      const idx = prev.findLastIndex((a) => a.filename === filename);
      if (idx < 0) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], ...patch };
      return updated;
    });
  }

  function upsertTodo(todo: Todo) {
    qc.setQueryData<Todo[]>(chatKeys.todos(chatId!), (prev = []) => {
      const exists = prev.find((t) => t.id === todo.id);
      if (exists)
        return prev.map((t) => (t.id === todo.id ? { ...t, ...todo } : t));
      return [...prev, todo];
    });
  }

  function invalidateChatData() {
    if (!chatId) return;
    qc.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
    qc.invalidateQueries({ queryKey: chatKeys.artifacts(chatId) });
    qc.invalidateQueries({ queryKey: chatKeys.todos(chatId) });
  }

  return {
    // Data
    messages: messagesQuery.data ?? [],
    artifacts: artifactsQuery.data ?? [],
    todos: todosQuery.data ?? [],
    chatDetail: chatDetailQuery.data ?? null,

    // Loading states
    isLoadingMessages: messagesQuery.isLoading,
    isLoadingArtifacts: artifactsQuery.isLoading,
    isLoadingTodos: todosQuery.isLoading,

    // Mutations
    updateTodo: updateTodoMutation.mutateAsync,
    revertToMessage: revertMutation.mutateAsync,

    invalidateChatData,
  };
}

// ---------------------------------------------------------------------------
// File upload (used by file-upload.tsx)
// ---------------------------------------------------------------------------
export function useFileUpload(chatId?: string) {
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
}
