import axiosInstance from '@/services/axiosInstance.service';
import { Chat, Message } from '@/types/chat';

export interface ChatProject {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  ownerId: string;
  createdAt: string;
}

export interface Checkpoint {
  id: string;
  chatId: string;
  messageId: string;
  label: string;
  createdAt: string;
}

export const chatApi = {
  getChats: async () => {
    const response = await axiosInstance.get<Chat[]>('/chat');
    return response.data;
  },

  getChat: async (chatId: string) => {
    const response = await axiosInstance.get<Chat>(`/chat/${chatId}`);
    return response.data;
  },

  deleteChat: async (chatId: string) => {
    const response = await axiosInstance.delete<{ success: boolean }>(
      `/chat/${chatId}`
    );
    return response.data;
  },

  createChat: async (agentId: string, title?: string) => {
    const response = await axiosInstance.post<Chat>('/chat', {
      agentId,
      title,
    });
    return response.data;
  },

  getChatMessages: async (chatId: string) => {
    const response = await axiosInstance.get<Message[]>(
      `/chat/${chatId}/messages`
    );
    return response.data;
  },

  revertToMessage: async (
    chatId: string,
    messageId: string,
    deleteSelf = false
  ) => {
    const response = await axiosInstance.post<{
      success: boolean;
      deletedCount: number;
      messageContent: string;
    }>(`/chat/${chatId}/messages/${messageId}/revert`, {
      delete_self: deleteSelf,
    });
    return response.data;
  },

  getCheckpoints: async (chatId: string) => {
    const res = await axiosInstance.get<Checkpoint[]>(
      `/chat/${chatId}/checkpoints`
    );
    return res.data;
  },

  createCheckpoint: async (
    chatId: string,
    messageId: string,
    label?: string
  ) => {
    const res = await axiosInstance.post<Checkpoint>(
      `/chat/${chatId}/checkpoints`,
      { messageId, label }
    );
    return res.data;
  },

  restoreCheckpoint: async (chatId: string, checkpointId: string) => {
    const res = await axiosInstance.post<{
      success: boolean;
      deletedCount: number;
      checkpointMessageId: string;
      checkpointMessage: Message;
    }>(`/chat/${chatId}/checkpoints/${checkpointId}/restore`);
    return res.data;
  },

  renameChat: async (chatId: string, title: string) => {
    const response = await axiosInstance.patch<{ id: string; title: string }>(
      `/chat/${chatId}`,
      { title }
    );
    return response.data;
  },

  getChatProject: async (chatId: string) => {
    const response = await axiosInstance.get<{ project: ChatProject | null }>(
      `/chat/${chatId}/project`
    );
    return response.data.project;
  },

  compactChat: async (
    chatId: string,
    options?: {
      focus?: string;
      modelId?: string;
      modelProvider?: string;
    }
  ) => {
    const response = await axiosInstance.post<{
      success: boolean;
      summary: string;
      compactedCount: number;
    }>(`/chat/${chatId}/compact`, {
      focus: options?.focus,
      model_id: options?.modelId,
      model_provider: options?.modelProvider,
    });
    return response.data;
  },
};
