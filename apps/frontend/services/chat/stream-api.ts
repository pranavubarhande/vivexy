import { camelToSnake } from '@/lib/caseConverters';
import { platform } from '@/lib/platform';
import { StreamMessageParams, SSEEvent } from '@/types/chat';

export const streamApi = {
  async *streamMessage(
    params: StreamMessageParams,
    signal?: AbortSignal
  ): AsyncGenerator<SSEEvent> {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const url = `${baseUrl}/chat/stream`;

    const authHeader: Record<string, string> = {};
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) authHeader['Authorization'] = `Bearer ${token}`;

      if (platform.isDesktop) {
        authHeader['X-Client-Tools'] = 'true';
      }
    }

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
