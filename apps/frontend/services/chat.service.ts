/**
 * Chat service facade — re-exports types from the split modules and
 * assembles a single `chatService` object for backward compatibility.
 *
 * New code should import directly from `@/services/chat/*` modules.
 */

export type {
  Chat,
  Message,
  Artifact,
  InlineTodo,
  Todo,
  LLMModel,
  ReasoningStep,
  StreamMessageParams,
  SSEEvent,
  TimelineItem,
} from '@/types/chat';

import { chatApi, Checkpoint } from '@/services/chat/chat-api';
export type { Checkpoint };
import { artifactApi } from './chat/artifact-api';
import { streamMessage } from '@/services/chat/stream-api';
import { attachmentApi } from '@/services/chat/attachment-api';
import { modelApi } from '@/services/chat/model-api';
import { approvalApi } from '@/services/chat/approval-api';

export { streamMessage };

export const chatService = {
  // Chat CRUD
  getChats: chatApi.getChats,
  getChat: chatApi.getChat,
  deleteChat: chatApi.deleteChat,
  createChat: chatApi.createChat,
  getChatMessages: chatApi.getChatMessages,
  revertToMessage: chatApi.revertToMessage,

  // Artifacts
  getChatArtifacts: artifactApi.getChatArtifacts,
  createArtifact: artifactApi.createArtifact,
  exportArtifact: artifactApi.exportArtifact,
  exportContent: artifactApi.exportContent,

  // Models
  getModels: modelApi.getModels,

  // Attachments
  uploadAttachment: attachmentApi.uploadAttachment,

  // Approval / tool results
  approveAction: approvalApi.approveAction,
  rejectAction: approvalApi.rejectAction,
  postToolResult: approvalApi.postToolResult,
  cancelTool: approvalApi.cancelTool,

  // Compaction
  compactChat: chatApi.compactChat,

  // Checkpoints
  getCheckpoints: chatApi.getCheckpoints,
  createCheckpoint: chatApi.createCheckpoint,
  restoreCheckpoint: chatApi.restoreCheckpoint,

  // Chat metadata
  renameChat: chatApi.renameChat,
  getChatProject: chatApi.getChatProject,
};
