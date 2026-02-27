import axiosInstance from './axiosInstance.service';
import { camelToSnake } from '@/lib/caseConverters';
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
  version?: number;
  createdAt: string;
  messageId?: string | null;
  url?: string | null;
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

/** Parameters for the streaming endpoint — will be camelCase→snake_case converted before sending */
export interface StreamMessageParams {
  chatId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  agentId: string;
  modelId: string | null;
  modelDbId: string | null;
  modelProvider: string;
  modelName: string;
  fileIds?: string[];
  files?: File[];
}

/** Discriminated union of all SSE event types the backend can emit */
export type SSEEvent =
  | { type: 'content'; data: string }
  | { type: 'reasoning'; data: Record<string, unknown>; isUpdate?: boolean }
  | { type: 'tool_call'; data: { tool: string; output: string } }
  | { type: 'artifact'; data: Record<string, unknown> }
  | {
      type: 'file_version';
      data: { filename?: string; version?: number; url?: string };
    }
  | { type: 'todo'; data: Record<string, unknown> }
  | {
      type: 'approval_request';
      data: {
        request_id: string;
        tool_name: string;
        tool_input: Record<string, unknown>;
        description?: string;
      };
    }
  | {
      type: 'done';
      data?: { content?: string };
      messageId?: string;
      userMessageId?: string;
    }
  | { type: 'error'; data: unknown };

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

  // Revert to message: delete all messages after messageId
  revertToMessage: async (chatId: string, messageId: string) => {
    const response = await axiosInstance.post<{
      success: boolean;
      deletedCount: number;
    }>(`/chat/${chatId}/messages/${messageId}/revert`);
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

  approveAction: async (chatId: string, requestId: string) => {
    const response = await axiosInstance.post<{ success: boolean }>(
      `/chat/${chatId}/approve`,
      { requestId }
    );
    return response.data;
  },

  rejectAction: async (chatId: string, requestId: string) => {
    const response = await axiosInstance.post<{ success: boolean }>(
      `/chat/${chatId}/reject`,
      { requestId }
    );
    return response.data;
  },

  /**
   * Stream a chat message via SSE.
   *
   * Mirrors the axiosInstance request interceptor:
   *   - Adds Bearer auth token from localStorage
   *   - Converts the request body from camelCase → snake_case
   *
   * Uses `fetch` + ReadableStream because axios buffers responses and
   * cannot process Server-Sent Events line-by-line in the browser.
   *
   * @returns AsyncGenerator that yields typed SSE events
   */
  async *streamMessage(
    params: StreamMessageParams,
    signal?: AbortSignal
  ): AsyncGenerator<SSEEvent> {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const url = `${baseUrl}/chat/stream`;

    // Build auth header — same logic as the axiosInstance request interceptor
    const authHeader: Record<string, string> = {};
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) authHeader['Authorization'] = `Bearer ${token}`;
    }

    // Convert body camelCase → snake_case — same as the axiosInstance interceptor
    const { files, ...jsonParams } = params;
    const bodyObj = camelToSnake(jsonParams) as Record<string, unknown>;

    let fetchBody: BodyInit;
    let contentTypeHeader: Record<string, string> = {};

    if (files && files.length > 0) {
      const formData = new FormData();
      formData.append('data', JSON.stringify(bodyObj));
      for (const file of files) {
        formData.append('files', file);
      }
      fetchBody = formData;
      // WARNING: Do NOT manually set Content-Type to multipart/form-data.
      // fetch() will set it automatically with the correct boundary.
    } else {
      fetchBody = JSON.stringify(bodyObj);
      contentTypeHeader = { 'Content-Type': 'application/json' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { ...contentTypeHeader, ...authHeader },
      body: fetchBody,
      signal,
    });

    if (!response.ok) {
      throw new Error(
        `Stream request failed: ${response.status} ${response.statusText}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No readable stream available');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            yield JSON.parse(data) as SSEEvent;
          } catch {
            console.warn('Failed to parse SSE line:', data);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },
};
