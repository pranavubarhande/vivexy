import { camelToSnake } from '@vivexy/core/lib/caseConverters';
import { platform } from '@vivexy/core/lib/platform';
import type {
  StreamMessageParams,
  SSEEvent,
  UserSkill,
  McpToolSpec,
} from '../../types/chat';

async function loadDesktopExtensions(): Promise<{
  userSkills: UserSkill[];
  mcpTools: McpToolSpec[];
}> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (!api) return { userSkills: [], mcpTools: [] };
  const [skillList, mcpToolList] = await Promise.all([
    api.getSkills().catch(() => []),
    api.getMcpTools().catch(() => []),
  ]);
  return {
    userSkills: skillList
      .filter((s) => s.enabled)
      .map((s) => ({
        name: s.name,
        description: s.description,
        content: s.content,
        ...(s.files && Object.keys(s.files).length > 0
          ? { files: s.files }
          : {}),
      })),
    mcpTools: mcpToolList as McpToolSpec[],
  };
}

export type StreamMessageOptions = StreamMessageParams & {
  local_filenames?: string[];
};

export async function streamMessage(
  params: StreamMessageOptions,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  const headers: Record<string, string> = {};
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (platform.isDesktop) headers['X-Client-Tools'] = 'true';
  }

  if (platform.isDesktop && !params.userSkills && !params.mcpTools) {
    const ext = await loadDesktopExtensions();
    params = { ...params, ...ext };
  }

  const { files, ...jsonParams } = params;
  const bodyObj = camelToSnake(jsonParams) as Record<string, unknown>;

  let body: BodyInit;
  if (files?.length) {
    const fd = new FormData();
    fd.append('data', JSON.stringify(bodyObj));
    files.forEach((f) => fd.append('files', f));
    body = fd;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(bodyObj);
  }

  // Step 1: POST /chat/start — regular JSON, returns stream_id after spawning the agent thread.
  const startRes = await fetch(`${baseUrl}/chat/start`, {
    method: 'POST',
    headers,
    body,
    signal,
  });
  if (!startRes.ok) throw new Error(`HTTP ${startRes.status}`);
  const { streamId } = (await startRes.json()) as { streamId: string };

  // Step 2: Subscribe via EventSource — native browser SSE API, not intercepted
  // by Sentry's fetch instrumentation, so events arrive incrementally.
  await new Promise<void>((resolve, reject) => {
    const es = new EventSource(`${baseUrl}/chat/events/${streamId}`);

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          es.close();
          resolve();
        },
        { once: true }
      );
    }

    es.onmessage = (e) => {
      if (!e.data || e.data === '[DONE]') return;
      let parsed: SSEEvent;
      try {
        parsed = JSON.parse(e.data) as SSEEvent;
      } catch {
        console.warn('SSE parse error:', e.data);
        return;
      }
      onEvent(parsed);
      if (parsed.type === 'done' || parsed.type === 'error') {
        es.close();
        if (parsed.type === 'error') {
          reject(
            new Error(
              String((parsed as { data?: unknown }).data ?? 'Stream error')
            )
          );
        } else {
          resolve();
        }
      }
    };

    es.onerror = () => {
      es.close();
      reject(new Error('EventSource connection failed'));
    };
  });
}
