import axiosInstance from '@/services/axiosInstance.service';
import { Chat, Message } from '@/types/chat';

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

  revertToMessage: async (chatId: string, messageId: string) => {
    const response = await axiosInstance.post<{
      success: boolean;
      deletedCount: number;
    }>(`/chat/${chatId}/messages/${messageId}/revert`);
    return response.data;
  },
};
