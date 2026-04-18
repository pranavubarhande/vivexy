'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/utils/common';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import { AgentSelector } from '@/components/chat/agent-selector';
import { ModelSelector } from '@/components/chat/model-selector';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatHeader } from '@/components/chat/chat-header';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatPanels } from '@/components/chat/chat-panels';
import { ApprovalDialog } from '@/components/chat/approval-dialog';
import { UploadedFile } from '@/components/chat/file-upload';

import { useChat, useChatHistory, useModels } from '@/hooks/useChat';
import { useChatStream } from '@/hooks/use-chat-stream';
import { useWorkspace } from '@/components/desktop/workspace-provider';

import { Artifact, LLMModel } from '@/services/chat.service';
import { File } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface AgenticChatConfig {
  availableAgents: AgentSummary[];
  defaultAgentId?: string;
  allowFileUpload?: boolean;
  showArtifacts?: boolean;
  showReasoning?: boolean;
  className?: string;
  basePath?: string;
}

interface AgenticChatProps {
  config: AgenticChatConfig;
  initialChatId?: string;
}

// ---------------------------------------------------------------------------
// Preference helpers
// ---------------------------------------------------------------------------

const getPref = (key: string) =>
  typeof window !== 'undefined' ? localStorage.getItem(key) : null;

const savePref = (key: string, value: string) => {
  if (value) localStorage.setItem(key, value);
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AgenticChat = ({ config, initialChatId }: AgenticChatProps) => {
  const searchParams = useSearchParams();

  // ---- Chat ID ----
  // Read from URL only on mount; after that, chatId is managed imperatively.
  const [chatId, setChatId] = useState<string | null>(
    () => initialChatId || searchParams.get('id') || null
  );

  // ---- Preferences ----
  const [selectedAgentId, setSelectedAgentId] = useState(
    getPref('preferredAgentId') ||
      config.defaultAgentId ||
      config.availableAgents[0]?.id ||
      'general'
  );
  const [selectedModelDbId, setSelectedModelDbId] = useState<string | null>(
    getPref('preferredModelDbId')
  );
  const [selectedModelId, setSelectedModelId] = useState<string | null>(
    getPref('preferredModelId')
  );
  const [selectedProvider, setSelectedProvider] = useState(
    getPref('preferredProvider') ?? ''
  );
  const [selectedModelName, setSelectedModelName] = useState(
    getPref('preferredModelName') ?? ''
  );

  // ---- Panel state ----
  const [showSidePanel, setShowSidePanel] = useState<'artifacts' | null>(null);

  // ---- Data (TanStack Query backed) ----
  const { models, isLoading: isLoadingModels } = useModels();

  const {
    chats,
    refetchHistory,
    deleteChat: apiDeleteChat,
    createChat: apiCreateChat,
    removeChatFromCache,
  } = useChatHistory();

  const { messages, artifacts, chatDetail, revertToMessage, createArtifact } =
    useChat(chatId || undefined);

  // ---- Workspace ----
  const { refreshWorkspaceInfo, workspacePath } = useWorkspace();
  const qc = useQueryClient();
  const prevWorkspaceRef = useRef(workspacePath);

  useEffect(() => {
    if (
      prevWorkspaceRef.current !== null &&
      workspacePath !== prevWorkspaceRef.current
    ) {
      qc.invalidateQueries({ queryKey: ['chats'] });
    }
    prevWorkspaceRef.current = workspacePath;
  }, [workspacePath, qc]);

  // ---- Stream ----
  const {
    isStreaming,
    isWaitingApproval,
    approvalRequest,
    isCreatingChatRef,
    isStreamingRef,
    streamingMessages,
    sendMessage,
    stopStreaming,
    handleApprove,
    handleReject,
    patchArtifact,
  } = useChatStream({
    messages,
    refetchHistory,
    onStreamEnd: refreshWorkspaceInfo,
  });

  // Merge query-backed messages with any currently-streaming messages.
  // During streaming, the user/assistant messages live in local React state
  // for immediate re-renders; once done they're persisted to the TQ cache.
  // We deduplicate by id to handle the brief overlap window when the TQ
  // cache has been written but streamingMessages hasn't cleared yet.
  const displayMessages = (() => {
    if (streamingMessages.length === 0) return messages;
    const ids = new Set(streamingMessages.map((m) => m.id));
    return [...messages.filter((m) => !ids.has(m.id)), ...streamingMessages];
  })();

  // ---- URL sync (browser back/forward only) ----
  useEffect(() => {
    const onPopState = () => {
      if (isStreamingRef.current || isCreatingChatRef.current) return;
      const urlId = new URL(window.location.href).searchParams.get('id');
      setChatId(urlId || null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isStreamingRef, isCreatingChatRef]);

  // ---- Sync preferences from loaded chat ----
  useEffect(() => {
    if (!chatDetail) return;
    const updates: Array<() => void> = [];
    if (chatDetail.lastModelId) {
      const model = models.find(
        (m: LLMModel) => m.id === chatDetail.lastModelId
      );
      if (model) {
        updates.push(
          () => setSelectedModelDbId(model.id),
          () => setSelectedModelId(model.modelId),
          () => setSelectedProvider(model.provider),
          () => setSelectedModelName(model.name)
        );
      }
    }
    if (chatDetail.agentId) {
      const agentId = chatDetail.agentId;
      updates.push(() => setSelectedAgentId(agentId));
    }
    if (updates.length > 0) {
      queueMicrotask(() => updates.forEach((fn) => fn()));
    }
  }, [chatDetail, models]);

  // ---- Save preferences ----
  useEffect(() => {
    savePref('preferredAgentId', selectedAgentId);
    savePref('preferredModelDbId', selectedModelDbId ?? '');
    savePref('preferredModelId', selectedModelId ?? '');
    savePref('preferredProvider', selectedProvider);
    savePref('preferredModelName', selectedModelName);
  }, [
    selectedAgentId,
    selectedModelDbId,
    selectedModelId,
    selectedProvider,
    selectedModelName,
  ]);

  // ---- URL helper ----
  // Use replaceState to avoid triggering Next.js navigation (which causes
  // searchParams to change asynchronously and can race with streaming).
  const updateUrl = useCallback((newChatId: string) => {
    const url = new URL(window.location.href);
    if (newChatId) url.searchParams.set('id', newChatId);
    else url.searchParams.delete('id');
    window.history.replaceState({}, '', url.pathname + url.search);
  }, []);

  // ---- Handlers ----
  const handleSend = async (
    content: string,
    files?: UploadedFile[],
    rawFiles?: File[]
  ) => {
    await sendMessage({
      content,
      files,
      rawFiles,
      chatId,
      selectedAgentId,
      selectedModelId,
      selectedModelDbId,
      selectedProvider,
      selectedModelName,
      createChat: apiCreateChat,
      onChatCreated: (id) => {
        setChatId(id);
        updateUrl(id);
      },
    });
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

  const handleNewChat = () => {
    setChatId(null);
    updateUrl('');
  };

  const handleChatSelect = (id: string) => {
    if (id === chatId) return;
    setChatId(id);
    updateUrl(id);
  };

  const handleChatDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this chat?')) return;
    try {
      await apiDeleteChat(id);
      removeChatFromCache(id);
      if (chatId === id) handleNewChat();
    } catch {
      toast.error('Failed to delete chat');
    }
  };

  const handleRevert = async (messageId: string) => {
    if (!chatId) return;
    try {
      await revertToMessage(messageId);
    } catch (err) {
      console.error('Failed to revert:', err);
    }
  };

  const toggleArtifactsPanel = () => {
    setShowSidePanel((p) => (p === 'artifacts' ? null : 'artifacts'));
  };

  // ---- Derived ----
  const selectedAgent = config.availableAgents.find(
    (a) => a.id === selectedAgentId
  );

  const handleSaveArtifact = async (
    artifact: Artifact & { language?: string },
    newContent: string
  ) => {
    if (!chatId) return;
    try {
      await createArtifact({
        title: artifact.title || undefined,
        type: artifact.type,
        filename: artifact.filename || undefined,
        language: artifact.language || undefined,
        content: newContent,
      });
      patchArtifact(chatId, artifact.filename || artifact.title || '', {
        content: newContent,
      });
    } catch (e) {
      console.error('Failed to save artifact', e);
      toast.error('Failed to save artifact');
    }
  };

  return (
    <div className={cn('flex h-full overflow-hidden', config.className)}>
      {/* Approval dialog */}
      <ApprovalDialog
        open={!!approvalRequest}
        request={approvalRequest}
        onApprove={(reqId) => handleApprove(chatId, reqId)}
        onReject={(reqId) => handleReject(chatId, reqId)}
      />

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader
          chats={chats}
          chatId={chatId}
          isStreaming={isStreaming}
          basePath={config.basePath}
          onChatSelect={handleChatSelect}
          onChatDelete={handleChatDelete}
          onNewChat={handleNewChat}
        />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 custom-scrollbar chat-bg-pattern">
          <div className="max-w-3xl mx-auto space-y-6">
            <ChatMessageList
              messages={displayMessages}
              agent={selectedAgent}
              showReasoning={config.showReasoning !== false}
              onRevert={handleRevert}
            />
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-border/50 bg-background/98 p-3 sm:p-4 shrink-0">
          <div className="max-w-3xl mx-auto space-y-2">
            {isStreaming && (
              <div className="flex justify-center -mt-8 mb-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={stopStreaming}
                  className="gap-2 bg-background shadow-md border-border/60 hover:border-primary/40 rounded-full px-4 h-8 text-xs"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Stop generating
                </Button>
              </div>
            )}

            <ChatInput
              onSend={handleSend}
              chatId={chatId || undefined}
              disabled={isStreaming || isWaitingApproval}
              showFileUpload={config.allowFileUpload !== false}
              placeholder={
                isWaitingApproval ? 'Waiting for your approval…' : 'Reply…'
              }
              className="rounded-2xl border border-border bg-background shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all"
            />

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
                <AgentSelector
                  agents={config.availableAgents}
                  selectedAgentId={selectedAgentId}
                  onSelect={setSelectedAgentId}
                  disabled={isStreaming}
                />
                <div className="w-px h-3.5 bg-border/60 shrink-0" />
                <ModelSelector
                  models={models}
                  isLoading={isLoadingModels}
                  selectedModelId={selectedModelDbId}
                  onSelect={handleModelSelect}
                  disabled={isStreaming}
                />
              </div>

              {config.showArtifacts && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={toggleArtifactsPanel}
                    className={cn(
                      'flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-medium transition-all shrink-0',
                      showSidePanel === 'artifacts'
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    <File size={12} />
                    <span className="hidden xs:inline sm:inline">Files</span>
                    {artifacts.length > 0 && (
                      <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[9px] font-bold">
                        {artifacts.length}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-center py-1">
              <p className="text-[10px] text-muted-foreground/50 px-0.5 text-center">
                AI can make mistakes. Double-check important information.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Side panels */}
      <ChatPanels
        showSidePanel={showSidePanel}
        setShowSidePanel={setShowSidePanel}
        artifacts={artifacts}
        onSaveArtifact={handleSaveArtifact}
      />
    </div>
  );
};
