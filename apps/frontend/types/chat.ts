/**
 * Shared types for the chat service domain.
 * Single source of truth — all other modules import from here.
 */

import {
  STREAM_EVENT_APPROVAL_REQUEST,
  STREAM_EVENT_ARTIFACT,
  STREAM_EVENT_ARTIFACT_STREAM,
  STREAM_EVENT_CHART,
  STREAM_EVENT_CLIENT_TOOL_REQUEST,
  STREAM_EVENT_COMPACT,
  STREAM_EVENT_CONTENT,
  STREAM_EVENT_DONE,
  STREAM_EVENT_ERROR,
  STREAM_EVENT_FILE_VERSION,
  STREAM_EVENT_PHASE_CHANGE,
  STREAM_EVENT_REASONING,
  STREAM_EVENT_TASK_COMPLETED,
  STREAM_EVENT_TASK_ERROR,
  STREAM_EVENT_TASK_PLANNED,
  STREAM_EVENT_TASK_STARTED,
  STREAM_EVENT_TODO,
  STREAM_EVENT_TOOL_CALL,
  STREAM_EVENT_START,
} from '@/constants/stream-events';

export interface Chat {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  agentId: string | null;
  lastModelId: string | null;
  githubContext?: GitContext | null;
  _count?: {
    messages: number;
    artifacts: number;
    todos: number;
  };
}

export interface InlineTodo {
  id: string;
  title: string;
  description?: string | null;
  status:
    | 'PENDING'
    | 'IN_PROGRESS'
    | 'RUNNING'
    | 'COMPLETED'
    | 'DONE'
    | 'ERROR';
}

export type TimelineItem =
  | { type: 'step'; step: ReasoningStep }
  | { type: 'content'; text: string }
  | { type: 'chart'; spec: Record<string, unknown>; title: string };

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: ReasoningStep[];
  timeline?: TimelineItem[];
  artifacts?: Artifact[];
  todos?: InlineTodo[];
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
  chatId?: string;
  url?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: any;
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
  maxOutputTokens: number | null;
  inputCost: number | null;
  outputCost: number | null;
  supportsVision: boolean;
  supportsReasoning: boolean;
}

export interface ReasoningStep {
  thought: string;
  toolCalls?: Array<{
    tool: string;
    input: Record<string, unknown>;
    output: string;
  }>;
}

export interface UserSkill {
  name: string;
  description: string;
  content: string;
  /** Supporting reference files in the skill folder: { filename → content } */
  files?: Record<string, string>;
}

export interface McpToolSpec {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Repository/git context injected into the agent's system prompt. */
export interface GitContext {
  /** 'github' for web OAuth repos, 'local' for desktop git workspace */
  type: 'github' | 'local';
  /** owner/repo for GitHub, folder name for local */
  fullName?: string;
  repoName?: string;
  branch: string;
  remote?: string;
  workspacePath?: string;
}

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
  /** Enabled user-defined skills (desktop only) */
  userSkills?: UserSkill[];
  /** Available MCP tool definitions from running servers (desktop only) */
  mcpTools?: McpToolSpec[];
  /** Active repository context — injected into the agent's system prompt */
  githubContext?: GitContext | null;
}

export type SSEEvent =
  | { type: typeof STREAM_EVENT_START; data?: Record<string, unknown> }
  | { type: typeof STREAM_EVENT_PHASE_CHANGE; data: { phase: string } }
  | { type: typeof STREAM_EVENT_CONTENT; data: string }
  | {
      type: typeof STREAM_EVENT_REASONING;
      data: Record<string, unknown>;
      isUpdate?: boolean;
    }
  | {
      type: typeof STREAM_EVENT_TOOL_CALL;
      data: {
        tool: string;
        input?: Record<string, unknown>;
        output: string;
      };
    }
  | { type: typeof STREAM_EVENT_ARTIFACT; data: Record<string, unknown> }
  | { type: typeof STREAM_EVENT_ARTIFACT_STREAM; data: Record<string, unknown> }
  | {
      type: typeof STREAM_EVENT_FILE_VERSION;
      data: { filename?: string; version?: number; url?: string };
    }
  | { type: typeof STREAM_EVENT_TODO; data: Record<string, unknown> }
  | {
      type: typeof STREAM_EVENT_TASK_PLANNED;
      data: {
        id: string;
        title: string;
        status: string;
        description?: string | null;
      };
    }
  | {
      type: typeof STREAM_EVENT_TASK_STARTED;
      data: { id: string; title: string; status: string };
    }
  | {
      type: typeof STREAM_EVENT_TASK_COMPLETED;
      data: { id: string; title: string; status: string };
    }
  | {
      type: typeof STREAM_EVENT_TASK_ERROR;
      data: {
        id: string;
        title: string;
        status: string;
        error?: string;
      };
    }
  | {
      type: typeof STREAM_EVENT_APPROVAL_REQUEST;
      data: {
        request_id: string;
        tool_name: string;
        tool_input: Record<string, unknown>;
        description?: string;
      };
    }
  | {
      type: typeof STREAM_EVENT_CLIENT_TOOL_REQUEST;
      data: {
        request_id: string;
        tool_name: string;
        tool_input: Record<string, unknown>;
      };
    }
  | {
      type: typeof STREAM_EVENT_CHART;
      data: { title: string; spec: Record<string, unknown> };
    }
  | {
      type: typeof STREAM_EVENT_COMPACT;
      data: { message: string; compactedCount: number };
    }
  | {
      type: typeof STREAM_EVENT_DONE;
      data?: { content?: string };
      messageId?: string;
      userMessageId?: string;
    }
  | { type: typeof STREAM_EVENT_ERROR; data: unknown };
