import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type Message, type Artifact } from '../services/chat.service';
import { chatKeys } from './useChat';

/**
 * Provides cache mutation helpers for TanStack Query chat data.
 * Extracted from use-chat-stream so the stream hook stays focused on SSE logic.
 */
export const useQueryCacheUpdater = () => {
  const qc = useQueryClient();

  const appendMessage = useCallback(
    (chatId: string, msg: Message) => {
      qc.setQueryData<Message[]>(chatKeys.messages(chatId), (prev = []) => [
        ...prev,
        msg,
      ]);
    },
    [qc]
  );

  const patchMessage = useCallback(
    (chatId: string, id: string, patch: Partial<Message>) => {
      qc.setQueryData<Message[]>(chatKeys.messages(chatId), (prev = []) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
      );
    },
    [qc]
  );

  const appendArtifact = useCallback(
    (chatId: string, artifact: Artifact) => {
      qc.setQueryData<Artifact[]>(chatKeys.artifacts(chatId), (prev = []) => [
        ...prev,
        artifact,
      ]);
    },
    [qc]
  );

  const patchArtifact = useCallback(
    (chatId: string, filenameOrTitle: string, patch: Partial<Artifact>) => {
      qc.setQueryData<Artifact[]>(chatKeys.artifacts(chatId), (prev = []) => {
        const idx = prev.findLastIndex(
          (a) => a.filename === filenameOrTitle || a.title === filenameOrTitle
        );
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...patch };
        return updated;
      });
    },
    [qc]
  );

  return {
    qc,
    appendMessage,
    patchMessage,
    appendArtifact,
    patchArtifact,
  };
};
