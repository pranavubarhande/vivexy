import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChatService,
  CreateChatData,
  CreateMessageData,
  StreamEvent,
} from '@/services/chat.service';
import { Artifact } from '@prisma/client';

export const useChats = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['chats'],
    queryFn: () => ChatService.getChats(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  return {
    chats: data || [],
    isLoading,
    error,
    refetch,
  };
};

export const useChat = (chatId: string) => {
  return useQuery({
    queryKey: ['chat', chatId],
    queryFn: () => ChatService.getChat(chatId),
    enabled: !!chatId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

export const useCreateChat = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateChatData) => ChatService.createChat(data),
    onSuccess: (newChat) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      // Navigate to the new chat
      window.location.href = `/chat/${newChat.id}`;
    },
  });
};

export const useUpdateChatTitle = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ chatId, title }: { chatId: string; title: string }) =>
      ChatService.updateChatTitle(chatId, title),
    onSuccess: (updatedChat) => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
      queryClient.invalidateQueries({ queryKey: ['chat', updatedChat.id] });
    },
  });
};

export const useDeleteChat = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (chatId: string) => ChatService.deleteChat(chatId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
};

export const useMessages = (chatId: string) => {
  return useQuery({
    queryKey: ['messages', chatId],
    queryFn: () => ChatService.getMessages(chatId),
    enabled: !!chatId,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
};

export const useUpdateMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      chatId,
      messageId,
      content,
      modelId,
    }: {
      chatId: string;
      messageId: string;
      content: string;
      modelId?: string;
    }) => ChatService.updateMessage(chatId, messageId, content, modelId),
    onSuccess: (_, { chatId }) => {
      queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
      queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
  });
};

export const useLLMModels = () => {
  return useQuery({
    queryKey: ['llm-models'],
    queryFn: () => ChatService.getLLMModels(),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useSendMessageStreaming = () => {
  const queryClient = useQueryClient();

  return {
    sendMessageStreaming: async function* (
      chatId: string,
      data: CreateMessageData
    ): AsyncIterable<StreamEvent> {
      for await (const event of ChatService.sendMessageStreaming(chatId, {
        ...data,
        stream: true,
      })) {
        if (event.type === 'assistant_message') {
          // Invalidate queries when done
          queryClient.invalidateQueries({ queryKey: ['messages', chatId] });
          queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
          queryClient.invalidateQueries({ queryKey: ['chats'] });
          queryClient.invalidateQueries({ queryKey: ['artifacts', chatId] });
        }
        yield event;
      }
    },
  };
};

export const useArtifacts = (chatId: string) => {
  return useQuery({
    queryKey: ['artifacts', chatId],
    queryFn: () => ChatService.getArtifacts(chatId),
    enabled: !!chatId,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
};

export const useDownloadArtifact = () => {
  return useMutation({
    mutationFn: ({
      artifact,
      format,
    }: {
      artifact: Artifact;
      format: 'pdf' | 'docx';
    }) => ChatService.downloadArtifact(artifact, format),
    onSuccess: ({ blob, filename }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  });
};
