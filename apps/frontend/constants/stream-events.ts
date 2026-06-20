/**
 * Stream event type constants for SSE/agent streaming.
 * Must match backend app/constants/stream_events.py so frontend and backend stay in sync.
 */

// Lifecycle
export const STREAM_EVENT_START = 'start' as const;
export const STREAM_EVENT_DONE = 'done' as const;
/** Redis worker terminal marker; not sent to client. */
export const STREAM_EVENT_REDIS_DONE = '__done__' as const;

// Content & reasoning
export const STREAM_EVENT_CONTENT = 'content' as const;
export const STREAM_EVENT_REASONING = 'reasoning' as const;

// Phases & tasks
export const STREAM_EVENT_PHASE_CHANGE = 'phase_change' as const;
export const STREAM_EVENT_TASK_PLANNED = 'task_planned' as const;
export const STREAM_EVENT_TASK_STARTED = 'task_started' as const;
export const STREAM_EVENT_TASK_COMPLETED = 'task_completed' as const;
export const STREAM_EVENT_TASK_ERROR = 'task_error' as const;

// Tools & approval
export const STREAM_EVENT_TOOL_CALL = 'tool_call' as const;
export const STREAM_EVENT_APPROVAL_REQUEST = 'approval_request' as const;
export const STREAM_EVENT_CLIENT_TOOL_REQUEST = 'client_tool_request' as const;

// Structured outputs
export const STREAM_EVENT_ARTIFACT = 'artifact' as const;
export const STREAM_EVENT_ARTIFACT_STREAM = 'artifact_stream' as const;
export const STREAM_EVENT_TODO = 'todo' as const;
export const STREAM_EVENT_FILE_VERSION = 'file_version' as const;

// Inline chart (rendered directly in the chat message timeline)
export const STREAM_EVENT_CHART = 'chart_render' as const;

// Compaction
export const STREAM_EVENT_COMPACT = 'compact' as const;

// Token usage (emitted before done)
export const STREAM_EVENT_USAGE = 'usage' as const;

// Error
export const STREAM_EVENT_ERROR = 'error' as const;

/** Union of all stream event type strings (for type guards / switches). */
export type StreamEventType =
  | typeof STREAM_EVENT_START
  | typeof STREAM_EVENT_DONE
  | typeof STREAM_EVENT_REDIS_DONE
  | typeof STREAM_EVENT_CONTENT
  | typeof STREAM_EVENT_REASONING
  | typeof STREAM_EVENT_PHASE_CHANGE
  | typeof STREAM_EVENT_TASK_PLANNED
  | typeof STREAM_EVENT_TASK_STARTED
  | typeof STREAM_EVENT_TASK_COMPLETED
  | typeof STREAM_EVENT_TASK_ERROR
  | typeof STREAM_EVENT_TOOL_CALL
  | typeof STREAM_EVENT_APPROVAL_REQUEST
  | typeof STREAM_EVENT_CLIENT_TOOL_REQUEST
  | typeof STREAM_EVENT_ARTIFACT
  | typeof STREAM_EVENT_ARTIFACT_STREAM
  | typeof STREAM_EVENT_TODO
  | typeof STREAM_EVENT_FILE_VERSION
  | typeof STREAM_EVENT_CHART
  | typeof STREAM_EVENT_COMPACT
  | typeof STREAM_EVENT_USAGE
  | typeof STREAM_EVENT_ERROR;
