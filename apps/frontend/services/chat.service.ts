import { Chat, Message, LLMModel, Artifact } from '@prisma/client';
import axiosInstance from '@/services/axiosInstance.service';
import { AgentResponse } from '@/agents-examples/stock-agent';

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

export type StreamEvent =
  | { type: 'start' }
  | { type: 'reasoning'; data: AgentResponse['reasoning'][0] }
  | { type: 'content'; data: string }
  | { type: 'done'; data: AgentResponse }
  | { type: 'user_message'; data: MessageWithModel }
  | { type: 'assistant_message'; data: MessageWithModel }
  | { type: 'error'; message: string };

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

  static async *sendMessageStreaming(
    chatId: string,
    data: CreateMessageData & { stream?: boolean }
  ): AsyncIterable<StreamEvent> {
    const baseURL = axiosInstance.defaults.baseURL || '/api';
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    const response = await fetch(`${baseURL}/chat/${chatId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ ...data, stream: true }),
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No reader');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6));
            yield event;
          } catch (e) {
            console.error('Error parsing stream data:', e);
          }
        }
      }
    }
  }

  static async getArtifacts(chatId: string): Promise<Artifact[]> {
    const response = await axiosInstance.get(`/chat/${chatId}/artifacts`);
    return response.data;
  }

  static async downloadArtifact(
    artifact: Artifact,
    format: 'pdf' | 'docx' = 'pdf'
  ): Promise<{ blob: Blob; filename: string }> {
    const baseURL = axiosInstance.defaults.baseURL || '/api';
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    const response = await fetch(
      `${baseURL}/chat/${artifact.chatId}/artifacts/${artifact.id}/download?format=${format}`,
      {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to download file');
    }

    const blob = await response.blob();

    // Generate filename with correct extension, removing any existing extension from artifact.filename
    const baseName = artifact.filename
      ? artifact.filename.replace(/\.[^/.]+$/, '') // Remove existing extension
      : artifact.title || 'artifact';

    const filename = `${baseName}.${format}`;

    return { blob, filename };
  }
}
