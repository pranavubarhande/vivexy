import axiosInstance from './axiosInstance.service';
import { UploadedFile } from '@/components/chat/file-upload';

export interface Chat {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  agentId: string | null;
  lastModelId: string | null;
  _count?: {
    messages: number;
    artifacts: number;
    todos: number;
  };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reasoning?: any[];
  artifacts?: Artifact[];
  createdAt: string;
  isStreaming?: boolean;
}

export interface Artifact {
  id: string;
  title: string | null;
  type: string;
  seq: number;
  content: string;
  filename: string | null;
  createdAt: string;
  messageId?: string | null;
}

export interface Todo {
  id: string;
  title: string;
  description: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  dueDate: string | null;
}

export interface LLMModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  contextWindow: number;
}

export const chatService = {
  // Chat Management
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

  // Artifacts
  getChatArtifacts: async (chatId: string) => {
    const response = await axiosInstance.get<Artifact[]>(
      `/chat/${chatId}/artifacts`
    );
    return response.data;
  },

  // Todos
  getChatTodos: async (chatId: string) => {
    const response = await axiosInstance.get<Todo[]>(`/chat/${chatId}/todos`);
    return response.data;
  },

  updateTodoStatus: async (
    chatId: string,
    todoId: string,
    status: Todo['status']
  ) => {
    const response = await axiosInstance.patch<Todo>(
      `/chat/${chatId}/todos/${todoId}`,
      { status }
    );
    return response.data;
  },

  // Models
  getModels: async () => {
    const response = await axiosInstance.get<LLMModel[]>('/chat/models');
    return response.data;
  },

  // Attachments
  uploadAttachment: async (chatId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axiosInstance.post<UploadedFile>(
      `/chat/${chatId}/attachments`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  // Streaming helper (returns the fetch response for consumption)
  getStreamUrl: () => {
    return `${process.env.NEXT_PUBLIC_API_URL || '/api'}/chat/stream`;
  },

  getAuthHeader: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      return token ? { Authorization: `Bearer ${token}` } : {};
    }
    return {};
  },
};
