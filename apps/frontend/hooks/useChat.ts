import { useState, useCallback, useEffect } from 'react';
import {
  chatService,
  Chat,
  Message,
  Artifact,
  Todo,
  LLMModel,
} from '@/services/chat.service';

export function useChat(chatId?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when chatId becomes falsy (New Chat)
  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setArtifacts([]);
      setTodos([]);
    }
  }, [chatId]);

  const loadChatData = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Load chat details
      let chatDetails: Chat | null = null;
      try {
        chatDetails = await chatService.getChat(id);
      } catch (err) {
        console.error('Failed to load chat details:', err);
      }

      // Load messages and artifacts so we can attach artifacts to messages for inline display
      let loadedArtifacts: Artifact[] = [];
      try {
        loadedArtifacts = await chatService.getChatArtifacts(id);
        setArtifacts(loadedArtifacts);
      } catch (err) {
        console.error('Failed to load artifacts:', err);
      }

      try {
        const msgs = await chatService.getChatMessages(id);
        let lastAssistantIndex = -1;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role?.toLowerCase() === 'assistant') {
            lastAssistantIndex = i;
            break;
          }
        }
        setMessages(
          msgs.map((m, i) => {
            const role = m.role.toLowerCase() as 'user' | 'assistant';
            const reasoning = (m.reasoning || []).map((step) => ({
              ...step,
              toolCalls: step.tool_calls || step.toolCalls,
            }));
            const messageArtifacts = loadedArtifacts.filter(
              (a) => (a as Artifact & { messageId?: string }).messageId === m.id
            );
            const hasAnyByMessage = loadedArtifacts.some(
              (a) => (a as Artifact & { messageId?: string }).messageId
            );
            const fallbackToLast =
              !hasAnyByMessage &&
              loadedArtifacts.length > 0 &&
              i === lastAssistantIndex;
            return {
              ...m,
              role,
              reasoning,
              artifacts:
                messageArtifacts.length > 0
                  ? messageArtifacts
                  : fallbackToLast
                    ? loadedArtifacts
                    : undefined,
            };
          })
        );
      } catch (err) {
        console.error('Failed to load messages:', err);
      }

      // Load todos
      try {
        const tds = await chatService.getChatTodos(id);
        setTodos(tds);
      } catch (err) {
        console.error('Failed to load todos:', err);
        // Don't set global error if only todos fail, but maybe we should if it's critical
      }

      return chatDetails;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createChat = useCallback(async (agentId: string, title?: string) => {
    try {
      return await chatService.createChat(agentId, title);
    } catch (err) {
      console.error('Failed to create chat:', err);
      throw err;
    }
  }, []);

  const deleteChat = useCallback(async (id: string) => {
    try {
      await chatService.deleteChat(id);
    } catch (err) {
      console.error('Failed to delete chat:', err);
      throw err;
    }
  }, []);

  const updateTodoStatus = useCallback(
    async (todoId: string, status: Todo['status']) => {
      if (!chatId) return;
      try {
        await chatService.updateTodoStatus(chatId, todoId, status);
        setTodos((prev) =>
          prev.map((t) => (t.id === todoId ? { ...t, status } : t))
        );
      } catch (err) {
        console.error('Failed to update todo:', err);
      }
    },
    [chatId]
  );

  return {
    messages,
    setMessages,
    artifacts,
    setArtifacts,
    todos,
    setTodos,
    isLoading,
    error,
    loadChatData,
    createChat,
    deleteChat,
    updateTodoStatus,
  };
}

export function useChatHistory() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await chatService.getChats();
      setChats(data);
    } catch (err) {
      console.error('Failed to load chat history:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { chats, isLoading, loadHistory, setChats };
}

export function useModels() {
  const [models, setModels] = useState<LLMModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadModels = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await chatService.getModels();
      setModels(data);
    } catch (err) {
      console.error('Failed to load models:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { models, isLoading, loadModels };
}

export function useFileUpload(chatId?: string) {
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!chatId) throw new Error('No chat ID provided');

      setIsUploading(true);
      try {
        return await chatService.uploadAttachment(chatId, file);
      } catch (err) {
        console.error('Failed to upload file:', err);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [chatId]
  );

  return { uploadFile, isUploading };
}
