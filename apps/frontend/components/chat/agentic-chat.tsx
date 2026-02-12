'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/utils/common';
import { Button } from '@/components/ui/button';
import { chatService } from '@/services/chat.service';
import { AgentSelector } from './agent-selector';
import { ModelSelector } from './model-selector';
import { ChatInput } from './chat-input';
import { MessageStream } from './message-stream';
import { ReasoningDisplay } from './reasoning-display';
import { ArtifactsPanel } from './artifacts-panel';
import { InlineArtifactCard } from './inline-artifact-card';
import { TodosPanel } from './todos-panel';
import { ChatHistoryDropdown } from './chat-history-dropdown';
import { UploadedFile } from './file-upload';
import { useChat, useChatHistory, useModels } from '@/hooks/useChat';
import { Plus, Share2 } from 'lucide-react';

import { Message, Artifact, Todo, LLMModel } from '@/services/chat.service';

function normalizeArtifact(data: unknown): Artifact {
  const raw =
    data && typeof data === 'object' && 'artifact' in data
      ? (data as { artifact: Record<string, unknown> }).artifact
      : (data as Record<string, unknown>);
  if (!raw || typeof raw !== 'object') {
    return {
      id: '',
      title: null,
      type: 'TXT',
      seq: 0,
      content: '',
      filename: null,
      createdAt: new Date().toISOString(),
    };
  }
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    title: r.title != null ? String(r.title) : null,
    type: String(r.type ?? 'TXT'),
    seq: Number(r.seq ?? 0),
    content: String(r.content ?? ''),
    filename: r.filename != null ? String(r.filename) : null,
    createdAt:
      r.createdAt != null && typeof r.createdAt === 'string'
        ? r.createdAt
        : new Date().toISOString(),
    messageId: r.messageId != null ? String(r.messageId) : null,
  };
}
import { ApprovalDialog, ApprovalRequest } from './approval-dialog';
import axiosInstance from '@/services/axiosInstance.service';
interface ReasoningStep {
  thought: string;
  toolCalls?: Array<{
    tool: string;
    input: Record<string, unknown>;
    output: string;
  }>;
}

interface AgentSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

// Config interface
export interface AgenticChatConfig {
  availableAgents: AgentSummary[];
  defaultAgentId?: string;
  allowFileUpload?: boolean;
  showArtifacts?: boolean;
  showTodos?: boolean;
  showReasoning?: boolean;
  className?: string;
  basePath?: string; // For URL updates, e.g., '/chat'
}

interface AgenticChatProps {
  config: AgenticChatConfig;
  initialChatId?: string;
}

export function AgenticChat({ config, initialChatId }: AgenticChatProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State
  const [chatId, setChatId] = useState<string | null>(
    initialChatId || searchParams.get('id')
  );

  // Approval state
  const [approvalRequest, setApprovalRequest] =
    useState<ApprovalRequest | null>(null);

  // Sync chatId with URL - but not during chat creation or streaming,
  // because router.push is async and the URL may not have updated yet,
  // which would incorrectly reset chatId to null and clear all messages.
  // Use refs (not state) for guards to avoid adding dependencies that re-fire the effect.
  useEffect(() => {
    const urlId = searchParams.get('id');
    if (
      urlId !== chatId &&
      !isCreatingChatRef.current &&
      !isStreamingRef.current
    ) {
      setChatId(urlId || null);
    }
  }, [searchParams, chatId]);
  const {
    messages,
    setMessages,
    artifacts,
    setArtifacts,
    todos,
    setTodos,
    loadChatData,
    createChat: apiCreateChat,
    deleteChat: apiDeleteChat,
    updateTodoStatus,
  } = useChat(chatId || undefined);

  const { chats, loadHistory, setChats } = useChatHistory();

  const [isStreaming, setIsStreaming] = useState(false);
  const [, setCurrentReasoning] = useState<ReasoningStep[]>([]);

  // Preferences from localStorage
  const getStoredPref = (key: string) => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(key);
  };

  const [selectedAgentId, setSelectedAgentId] = useState(
    getStoredPref('preferredAgentId') ||
      config.defaultAgentId ||
      config.availableAgents[0]?.id ||
      'general'
  );
  const [selectedModelDbId, setSelectedModelDbId] = useState<string | null>(
    getStoredPref('preferredModelDbId')
  );
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    getStoredPref('preferredModelId')
  );
  const [selectedProvider, setSelectedProvider] = useState<string>(
    getStoredPref('preferredProvider') || ''
  );
  const [selectedModelName, setSelectedModelName] = useState<string>(
    getStoredPref('preferredModelName') || ''
  );

  const [showSidePanel, setShowSidePanel] = useState<
    'artifacts' | 'todos' | null
  >(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCreatingChatRef = useRef(false);
  const isStreamingRef = useRef(false);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const { models, isLoading: isLoadingModels, loadModels } = useModels();

  // Load chat history and models on mount
  useEffect(() => {
    loadHistory();
    loadModels();
  }, [loadHistory, loadModels]);

  // Load chat data when chatId changes
  useEffect(() => {
    let isCancelled = false;

    if (
      chatId &&
      !isCreatingChatRef.current &&
      !isStreamingRef.current &&
      models.length > 0
    ) {
      // Clear current chat state before loading new one
      setMessages([]);
      setArtifacts([]);
      setTodos([]);

      loadChatData(chatId).then((chat) => {
        if (isCancelled) return;

        if (chat && chat.lastModelId) {
          const model = models.find((m: LLMModel) => m.id === chat.lastModelId);
          if (model) {
            setSelectedModelDbId(model.id);
            setSelectedModelId(model.modelId);
            setSelectedProvider(model.provider);
            setSelectedModelName(model.name);
          }
        }
        if (chat && chat.agentId) {
          setSelectedAgentId(chat.agentId);
        }
      });
    }

    return () => {
      isCancelled = true;
    };
  }, [chatId, loadChatData, models, setMessages, setArtifacts, setTodos]);

  // Save preferences to localStorage
  useEffect(() => {
    if (selectedAgentId)
      localStorage.setItem('preferredAgentId', selectedAgentId);
    if (selectedModelDbId)
      localStorage.setItem('preferredModelDbId', selectedModelDbId);
    if (selectedModelId)
      localStorage.setItem('preferredModelId', selectedModelId);
    if (selectedProvider)
      localStorage.setItem('preferredProvider', selectedProvider);
    if (selectedModelName)
      localStorage.setItem('preferredModelName', selectedModelName);
  }, [
    selectedAgentId,
    selectedModelDbId,
    selectedModelId,
    selectedProvider,
    selectedModelName,
  ]);

  const updateUrl = (newChatId: string) => {
    const url = new URL(window.location.href);
    if (newChatId) {
      url.searchParams.set('id', newChatId);
    } else {
      url.searchParams.delete('id');
    }
    router.push(url.pathname + url.search, { scroll: false });
  };

  const handleSend = async (
    content: string,
    files?: UploadedFile[],
    rawFiles?: File[]
  ) => {
    if (
      !content.trim() &&
      (!files || files.length === 0) &&
      (!rawFiles || rawFiles.length === 0)
    )
      return;
    if (!selectedModelDbId) {
      alert('Please select a model first');
      return;
    }

    let currentChatId = chatId;

    // Create chat if needed
    if (!currentChatId) {
      try {
        isCreatingChatRef.current = true;
        const newChat = await apiCreateChat(selectedAgentId);
        currentChatId = newChat.id;
        setChatId(currentChatId);
        updateUrl(currentChatId);
        loadHistory(); // Refresh history to show new chat
      } catch (error) {
        console.error('Failed to create chat:', error);
        isCreatingChatRef.current = false; // Reset on error
        return;
      }
    }

    // Auto-upload any raw files that haven't been uploaded yet
    const allFileIds: string[] = files?.map((f) => f.id) || [];
    if (rawFiles && rawFiles.length > 0 && currentChatId) {
      for (const rawFile of rawFiles) {
        try {
          const uploaded = await chatService.uploadAttachment(
            currentChatId,
            rawFile
          );
          allFileIds.push(uploaded.id);
        } catch (err) {
          console.error('Failed to auto-upload file:', rawFile.name, err);
        }
      }
    }

    // Add user message and placeholder assistant message
    // Use flushSync to guarantee immediate DOM painting
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: Message = {
      id: `temp-assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
      reasoning: [],
      createdAt: new Date().toISOString(),
    };
    isStreamingRef.current = true;
    flushSync(() => {
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);
      setCurrentReasoning([]);
    });

    // Stream response
    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch(chatService.getStreamUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...chatService.getAuthHeader(),
        } as HeadersInit,
        body: JSON.stringify({
          chatId: currentChatId,
          messages: [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content },
          ],
          agentId: selectedAgentId,
          modelId: selectedModelId,
          modelDbId: selectedModelDbId,
          modelProvider: selectedProvider,
          modelName: selectedModelName,
          fileIds: allFileIds.length > 0 ? allFileIds : undefined,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Stream request failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const decoder = new TextDecoder();
      let accumulatedContent = '';
      const accumulatedReasoning: ReasoningStep[] = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

          const data = trimmedLine.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case 'content':
                accumulatedContent += event.data;
                flushSync(() => {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessage.id
                        ? { ...m, content: accumulatedContent }
                        : m
                    )
                  );
                });
                break;

              case 'approval_request':
                setApprovalRequest({
                  request_id: event.data.request_id,
                  tool_name: event.data.tool_name,
                  tool_input: event.data.tool_input,
                  description: event.data.description,
                });
                break;

              case 'reasoning': {
                // Convert snake_case tool_calls to camelCase toolCalls
                // for compatibility with ReasoningDisplay component
                const reasoningStep = {
                  ...event.data,
                  toolCalls: event.data.tool_calls || event.data.toolCalls,
                };
                if (event.isUpdate && accumulatedReasoning.length > 0) {
                  accumulatedReasoning[accumulatedReasoning.length - 1] =
                    reasoningStep;
                } else {
                  accumulatedReasoning.push(reasoningStep);
                }
                flushSync(() => {
                  setCurrentReasoning([...accumulatedReasoning]);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessage.id
                        ? { ...m, reasoning: [...accumulatedReasoning] }
                        : m
                    )
                  );
                });
                break;
              }

              case 'tool_call': {
                // Update the matching reasoning step with tool output
                const toolData = event.data;
                for (let i = accumulatedReasoning.length - 1; i >= 0; i--) {
                  const step = accumulatedReasoning[i];
                  if (
                    step.toolCalls &&
                    step.toolCalls?.[0]?.tool === toolData.tool
                  ) {
                    step.toolCalls[0].output = toolData.output;
                    break;
                  }
                }
                setCurrentReasoning([...accumulatedReasoning]);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id
                      ? { ...m, reasoning: [...accumulatedReasoning] }
                      : m
                  )
                );
                break;
              }

              case 'artifact': {
                const artifact = normalizeArtifact(event.data);
                if (!artifact.id) break;
                flushSync(() => {
                  setArtifacts((prev) => [...prev, artifact]);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessage.id
                        ? {
                            ...m,
                            artifacts: [...(m.artifacts ?? []), artifact],
                          }
                        : m
                    )
                  );
                });
                break;
              }

              case 'todo':
                setTodos((prev) => {
                  const exists = prev.find((t) => t.id === event.data.id);
                  if (exists) {
                    return prev.map((t) =>
                      t.id === event.data.id ? { ...t, ...event.data } : t
                    );
                  }
                  return [...prev, event.data];
                });
                break;

              case 'done':
                // Use done event content as fallback if streaming content was missed
                if (event.data?.content && !accumulatedContent) {
                  accumulatedContent = event.data.content;
                }
                flushSync(() => {
                  setMessages((prev) =>
                    prev.map((m) => {
                      if (m.id === assistantMessage.id) {
                        return {
                          ...m,
                          content:
                            accumulatedContent ||
                            event.data?.content ||
                            m.content,
                          isStreaming: false,
                          id: event.messageId || m.id,
                        };
                      }
                      // Also update the temp user message id with the real one
                      if (event.userMessageId && m.id === userMessage.id) {
                        return { ...m, id: event.userMessageId };
                      }
                      return m;
                    })
                  );
                });
                // If it was the first message, refresh history to show generated title
                if (messages.length === 0) {
                  loadHistory();
                }
                break;

              case 'error':
                console.error('Stream error:', event.data);
                break;
            }
          } catch (e) {
            console.error('Failed to parse SSE event:', e, data);
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('Stream aborted');
      } else {
        console.error('Streaming failed:', error);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  content: 'Error: Failed to get response',
                  isStreaming: false,
                }
              : m
          )
        );
      }
    } finally {
      flushSync(() => {
        setIsStreaming(false);
      });
      abortControllerRef.current = null;

      // Safety net: ensure URL is synced before releasing control refs
      if (currentChatId) {
        const url = new URL(window.location.href);
        if (url.searchParams.get('id') !== currentChatId) {
          url.searchParams.set('id', currentChatId);
          window.history.replaceState({}, '', url.pathname + url.search);
        }
      }

      // Release control refs AFTER URL is synced
      isStreamingRef.current = false;
      isCreatingChatRef.current = false;
    }
  };

  const handleModelSelect = (
    dbId: string,
    provider: string,
    modelId: string,
    modelName: string
  ) => {
    setSelectedModelDbId(dbId);
    setSelectedModelId(modelId);
    setSelectedProvider(provider);
    setSelectedModelName(modelName);
  };

  const handleApprove = async (requestId: string) => {
    try {
      await axiosInstance.post(`/chat/${chatId}/approve`, { requestId });
      setApprovalRequest(null);
    } catch (error) {
      console.error('Failed to approve:', error);
      alert('Failed to approve action');
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      await axiosInstance.post(`/chat/${chatId}/reject`, { requestId });
      setApprovalRequest(null);
    } catch (error) {
      console.error('Failed to reject:', error);
      alert('Failed to reject action');
    }
  };

  const handleTodoStatusChange = (todoId: string, status: Todo['status']) => {
    updateTodoStatus(todoId, status);
  };

  const handleNewChat = () => {
    setChatId(null);
    setMessages([]);
    setArtifacts([]);
    setTodos([]);
    updateUrl('');
  };

  const handleChatSelect = (id: string) => {
    if (id === chatId) return;
    setChatId(id);
    updateUrl(id);
  };

  const handleChatDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this chat?')) {
      try {
        await apiDeleteChat(id);
        setChats((prev) => prev.filter((c) => c.id !== id));
        if (chatId === id) {
          handleNewChat();
        }
      } catch {
        alert('Failed to delete chat');
      }
    }
  };

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
  };

  const handleShare = async () => {
    if (!chatId) return;
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}${config.basePath || '/chat'}?id=${chatId}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('Chat link copied to clipboard');
    } catch {
      alert('Could not copy link');
    }
  };

  const selectedAgent = config.availableAgents.find(
    (a) => a.id === selectedAgentId
  );

  return (
    <div className={cn('flex h-full overflow-hidden', config.className)}>
      {/* Approval Dialog */}
      <ApprovalDialog
        open={!!approvalRequest}
        request={approvalRequest}
        onApprove={handleApprove}
        onReject={handleReject}
      />

      {/* Main chat area – reference: clean, light, minimal */}
      <div className="flex-1 flex flex-col min-w-0 dark:bg-background">
        {/* Header: title + dropdown, Share on right */}
        <header className="h-14 border-b border-border/50 bg-background/95 backdrop-blur-sm flex items-center justify-between px-4 sticky top-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <ChatHistoryDropdown
              chats={chats}
              onSelect={handleChatSelect}
              onDelete={handleChatDelete}
              activeChatId={chatId}
            />
            <button
              onClick={handleNewChat}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
              title="New chat"
            >
              <Plus size={20} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center gap-2 text-xs font-medium text-muted-foreground',
                isStreaming && 'text-primary'
              )}
            >
              <div
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  isStreaming
                    ? 'bg-primary animate-pulse'
                    : 'bg-muted-foreground/30'
                )}
              />
              <span className="hidden sm:inline">
                {isStreaming ? 'Generating…' : 'Idle'}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              disabled={!chatId}
              className="gap-2"
            >
              <Share2 size={16} />
              Share
            </Button>
          </div>
        </header>

        {/* Messages – same width as input (max-w-5xl), centered; agent no background */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 custom-scrollbar">
          <div className="max-w-5xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="h-full min-h-[40vh] flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in zoom-in-95 duration-500">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <span className="text-3xl">
                    {selectedAgent?.icon || '🤖'}
                  </span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {selectedAgent?.name
                    ? `How can ${selectedAgent.name} help?`
                    : 'How can I help today?'}
                </h1>
                <p className="text-muted-foreground max-w-sm text-sm">
                  {selectedAgent?.description ||
                    "I'm your agentic portfolio assistant. I can analyze stocks, manage documents, and help with your financial goals."}
                </p>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'group animate-in fade-in slide-in-from-bottom-2 duration-300',
                  message.role === 'user'
                    ? 'flex justify-end pl-4'
                    : 'flex flex-col w-full'
                )}
              >
                {message.role === 'user' ? (
                  /* User: background bubble, middle with slight space on left */
                  <div className="space-y-2 items-end flex flex-col max-w-[85%]">
                    <div className="rounded-2xl px-4 py-3 shadow-sm bg-[#e8e6e3] dark:bg-muted text-foreground border border-border/50">
                      <MessageStream
                        content={message.content}
                        role={message.role}
                        isStreaming={message.isStreaming}
                      />
                    </div>
                    <div className="flex items-center gap-2 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Assistant: centered, no background, same width as input */
                  <div className="w-full space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold"
                        style={{
                          backgroundColor: `${selectedAgent?.color}20`,
                          color: selectedAgent?.color,
                        }}
                      >
                        {selectedAgent?.icon || '🤖'}
                      </div>
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        {selectedAgent?.name || 'Assistant'}
                      </span>
                    </div>
                    <div className="w-full">
                      {config.showReasoning !== false &&
                        message.reasoning &&
                        message.reasoning.length > 0 && (
                          <ReasoningDisplay steps={message.reasoning} />
                        )}
                      <MessageStream
                        content={message.content}
                        role={message.role}
                        isStreaming={message.isStreaming}
                      />
                      {message.artifacts && message.artifacts.length > 0 && (
                        <div className="mt-3 space-y-3">
                          {message.artifacts.map((art) => (
                            <InlineArtifactCard key={art.id} artifact={art} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        {/* Input area – reference: Reply…, + left, model right, disclaimer below */}
        <div className="border-t border-border/50 bg-background/95 backdrop-blur-sm p-4">
          <div className="max-w-5xl mx-auto space-y-3">
            {isStreaming && (
              <div className="flex justify-center -mt-10 mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={stopStreaming}
                  className="gap-2 bg-background shadow-md border-primary/20 hover:border-primary/40 rounded-full px-4"
                >
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  Stop generating
                </Button>
              </div>
            )}

            <ChatInput
              onSend={handleSend}
              chatId={chatId || undefined}
              disabled={isStreaming}
              showFileUpload={config.allowFileUpload !== false}
              placeholder="Reply…"
              className="rounded-2xl border border-border bg-background shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2 flex-wrap">
                <AgentSelector
                  agents={config.availableAgents}
                  selectedAgentId={selectedAgentId}
                  onSelect={setSelectedAgentId}
                  disabled={isStreaming}
                />
                <div className="w-px h-4 bg-muted-foreground/20 hidden sm:block" />
                <ModelSelector
                  models={models}
                  isLoading={isLoadingModels}
                  selectedModelId={selectedModelDbId}
                  onSelect={handleModelSelect}
                  disabled={isStreaming}
                />
              </div>

              <div className="flex items-center gap-1.5">
                {config.showTodos && (
                  <Button
                    variant={showSidePanel === 'todos' ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() =>
                      setShowSidePanel((p) => (p === 'todos' ? null : 'todos'))
                    }
                    className={cn(
                      'h-8 text-[11px] font-medium transition-all duration-200',
                      showSidePanel === 'todos'
                        ? 'bg-primary/10 text-primary hover:bg-primary/20'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    TASKS
                    {todos.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[9px] font-bold">
                        {todos.length}
                      </span>
                    )}
                  </Button>
                )}
                {config.showArtifacts && (
                  <Button
                    variant={
                      showSidePanel === 'artifacts' ? 'secondary' : 'ghost'
                    }
                    size="sm"
                    onClick={() =>
                      setShowSidePanel((p) =>
                        p === 'artifacts' ? null : 'artifacts'
                      )
                    }
                    className={cn(
                      'h-8 text-[11px] font-medium transition-all duration-200',
                      showSidePanel === 'artifacts'
                        ? 'bg-primary/10 text-primary hover:bg-primary/20'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    ARTIFACTS
                    {artifacts.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[9px] font-bold">
                        {artifacts.length}
                      </span>
                    )}
                  </Button>
                )}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground px-1">
              AI can make mistakes. Please double-check important information.
            </p>
          </div>
        </div>
      </div>

      {/* Side panel */}
      {showSidePanel && (
        <div className="w-80 border-l flex flex-col bg-background">
          <div className="flex items-center justify-between p-3 border-b">
            <h3 className="font-semibold">
              {showSidePanel === 'artifacts' ? '📂 Artifacts' : '✅ Tasks'}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSidePanel(null)}
              className="h-6 w-6 p-0"
            >
              ✕
            </Button>
          </div>

          <div className="flex-1 min-h-0">
            {showSidePanel === 'artifacts' ? (
              <ArtifactsPanel artifacts={artifacts} />
            ) : (
              <TodosPanel
                todos={todos}
                onStatusChange={handleTodoStatusChange}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
