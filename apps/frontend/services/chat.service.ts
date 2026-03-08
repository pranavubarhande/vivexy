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
  StreamMessageParams,
  SSEEvent,
} from '@/types/chat';

import { chatApi } from '@/services/chat/chat-api';
import { artifactApi } from './chat/artifact-api';
import { streamApi } from '@/services/chat/stream-api';
import { attachmentApi } from '@/services/chat/attachment-api';
import { modelApi } from '@/services/chat/model-api';
import { approvalApi } from '@/services/chat/approval-api';

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

  // Streaming
  streamMessage: streamApi.streamMessage.bind(streamApi),
};
