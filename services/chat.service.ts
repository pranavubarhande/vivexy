import { Chat, Message, LLMModel } from '@prisma/client';
import axiosInstance from '@/services/axiosInstance.service';

export interface CreateChatData {
  title?: string;
}

export interface CreateMessageData {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  modelId?: string;
}

export interface ChatWithMessages extends Chat {
  messages: Message[];
}

export interface MessageWithModel extends Message {
  model?: LLMModel | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reasoning: any;
}

export class ChatService {
  static async getChats(): Promise<ChatWithMessages[]> {
    const response = await axiosInstance.get('/chat', {
      params: {
        include: 'messages',
      },
    });
    return response.data;
  }

  static async getChat(chatId: string): Promise<ChatWithMessages> {
    const response = await axiosInstance.get(`/chat/${chatId}`);
    return response.data;
  }

  static async createChat(data: CreateChatData): Promise<Chat> {
    const response = await axiosInstance.post('/chat', data);
    return response.data;
  }

  static async updateChatTitle(chatId: string, title: string): Promise<Chat> {
    const response = await axiosInstance.patch(`/chat/${chatId}`, { title });
    return response.data;
  }

  static async deleteChat(chatId: string): Promise<void> {
    await axiosInstance.delete(`/chat/${chatId}`);
  }

  static async getMessages(chatId: string): Promise<MessageWithModel[]> {
    const response = await axiosInstance.get(`/chat/${chatId}/messages`);
    return response.data;
  }

  static async sendMessage(
    chatId: string,
    data: CreateMessageData
  ): Promise<MessageWithModel> {
    const response = await axiosInstance.post(`/chat/${chatId}/messages`, data);
    return response.data;
  }

  static async updateMessage(
    chatId: string,
    messageId: string,
    content: string,
    modelId?: string
  ): Promise<MessageWithModel> {
    const response = await axiosInstance.put(`/chat/${chatId}/messages`, {
      messageId,
      content,
      modelId,
    });
    return response.data;
  }

  static async getLLMModels(): Promise<LLMModel[]> {
    const response = await axiosInstance.get('/chat/models');
    return response.data;
  }
}
