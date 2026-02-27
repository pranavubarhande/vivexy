'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/utils/common';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { AgentSelector } from '@/components/chat/agent-selector';
import { ModelSelector } from '@/components/chat/model-selector';
import { ChatInput } from '@/components/chat/chat-input';
import { ArtifactsPanel } from '@/components/chat/artifacts-panel';
import { TodosPanel } from '@/components/chat/todos-panel';
import { ChatHistoryDropdown } from '@/components/chat/chat-history-dropdown';
import { ApprovalDialog } from '@/components/chat/approval-dialog';
import { ChatMessage } from '@/components/chat/chat-message';
import { UploadedFile } from '@/components/chat/file-upload';

import { useChat, useChatHistory, useModels } from '@/hooks/useChat';
import { useChatStream } from '@/hooks/use-chat-stream';
import { useIsMobile } from '@/hooks/use-mobile';
import { LLMModel } from '@/services/chat.service';

import {
  Plus,
  Share2,
  Maximize2,
  PanelRight,
  CheckSquare,
  PanelRightClose,
  File,
} from 'lucide-react';

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
  showTodos?: boolean;
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

export function AgenticChat({ config, initialChatId }: AgenticChatProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();

  // ---- Chat ID ----
  const [chatId, setChatId] = useState<string | null>(
    initialChatId || searchParams.get('id')
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
  const [showSidePanel, setShowSidePanel] = useState<
    'artifacts' | 'todos' | null
  >(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ---- Data (TanStack Query backed) ----
  const { models, isLoading: isLoadingModels } = useModels();

  const {
    chats,
    refetchHistory,
    deleteChat: apiDeleteChat,
    createChat: apiCreateChat,
    removeChatFromCache,
  } = useChatHistory();

  const {
    messages,
    artifacts,
    todos,
    chatDetail,
    updateTodo,
    revertToMessage,
    invalidateChatData,
  } = useChat(chatId || undefined);

  // ---- Stream ----
  const {
    isStreaming,
    isWaitingApproval,
    approvalRequest,
    isCreatingChatRef,
    isStreamingRef,
    sendMessage,
    stopStreaming,
    handleApprove,
    handleReject,
  } = useChatStream({
    messages,
    refetchHistory,
  });

  // ---- URL sync ----
  useEffect(() => {
    const urlId = searchParams.get('id');
    if (
      urlId !== chatId &&
      !isCreatingChatRef.current &&
      !isStreamingRef.current
    ) {
      setChatId(urlId || null);
    }
  }, [searchParams, chatId, isCreatingChatRef, isStreamingRef]);

  // ---- Sync preferences from loaded chat ----
  useEffect(() => {
    if (!chatDetail) return;
    if (chatDetail.lastModelId) {
      const model = models.find(
        (m: LLMModel) => m.id === chatDetail.lastModelId
      );
      if (model) {
        setSelectedModelDbId(model.id);
        setSelectedModelId(model.modelId);
        setSelectedProvider(model.provider);
        setSelectedModelName(model.name);
      }
    }
    if (chatDetail.agentId) setSelectedAgentId(chatDetail.agentId);
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
  const updateUrl = useCallback(
    (newChatId: string) => {
      const url = new URL(window.location.href);
      if (newChatId) url.searchParams.set('id', newChatId);
      else url.searchParams.delete('id');
      router.push(url.pathname + url.search, { scroll: false });
    },
    [router]
  );

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
      alert('Failed to delete chat');
    }
  };

  const handleShare = async () => {
    if (!chatId) return;
    const url = `${window.location.origin}${config.basePath || '/chat'}?id=${chatId}`;
    try {
      await navigator.clipboard.writeText(url);
      alert('Chat link copied to clipboard');
    } catch {
      alert('Could not copy link');
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

  const handleTodoStatus = (
    todoId: string,
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  ) => {
    updateTodo({ todoId, status });
  };

  const togglePanel = (panel: 'artifacts' | 'todos') => {
    setShowSidePanel((p) => (p === panel ? null : panel));
    setIsFullscreen(false);
  };

  // ---- Derived ----
  const selectedAgent = config.availableAgents.find(
    (a) => a.id === selectedAgentId
  );

  // ---- Panel JSX ----
  const panelContent = showSidePanel && (
    <>
      {showSidePanel === 'artifacts' ? (
        <ArtifactsPanel artifacts={artifacts} />
      ) : (
        <TodosPanel todos={todos} onStatusChange={handleTodoStatus} />
      )}
    </>
  );

  const panelHeader = showSidePanel && (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        {showSidePanel === 'artifacts' ? (
          <PanelRight size={15} className="text-primary" />
        ) : (
          <CheckSquare size={15} className="text-primary" />
        )}
        <h3 className="font-semibold text-sm">
          {showSidePanel === 'artifacts' ? 'Artifacts' : 'Tasks'}
        </h3>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
          {showSidePanel === 'artifacts' ? artifacts.length : todos.length}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {showSidePanel === 'artifacts' && !isMobile && (
          <button
            onClick={() => setIsFullscreen((f) => !f)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            <Maximize2 size={14} />
          </button>
        )}
        <button
          onClick={() => {
            setShowSidePanel(null);
            setIsFullscreen(false);
          }}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Close panel"
        >
          <PanelRightClose size={14} />
        </button>
      </div>
    </div>
  );

  const hasPanelButtons = config.showTodos || config.showArtifacts;

  return (
    <div className={cn('flex h-full overflow-hidden', config.className)}>
      {/* Approval dialog */}
      <ApprovalDialog
        open={!!approvalRequest}
        request={approvalRequest}
        onApprove={(reqId) => handleApprove(chatId, reqId)}
        onReject={(reqId) => handleReject(chatId, reqId)}
      />

      {/* Fullscreen overlay */}
      {isFullscreen && showSidePanel && !isMobile && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          {panelHeader}
          <div className="flex-1 min-h-0 overflow-hidden">{panelContent}</div>
        </div>
      )}

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header — left-padded on mobile to avoid menu-icon overlap */}
        <header className="h-14 border-b border-border/50 bg-background/95 backdrop-blur-sm flex items-center justify-between px-4 pl-14 md:pl-4 sticky top-0 z-10 shrink-0">
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
              <Plus size={18} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium text-muted-foreground',
                isStreaming && 'text-primary'
              )}
            >
              <div
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
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
              className="gap-1.5 h-8 text-xs"
            >
              <Share2 size={14} />
              <span className="hidden sm:inline">Share</span>
            </Button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 custom-scrollbar chat-bg-pattern">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="h-full min-h-[40vh] flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in zoom-in-95 duration-500">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-2 shadow-sm">
                  <span className="text-3xl">
                    {selectedAgent?.icon || '🤖'}
                  </span>
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {selectedAgent?.name
                    ? `How can ${selectedAgent.name} help?`
                    : 'How can I help today?'}
                </h1>
                <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
                  {selectedAgent?.description ||
                    "I'm your agentic portfolio assistant. I can analyze stocks, manage documents, and help with your financial goals."}
                </p>
              </div>
            )}

            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                agentName={selectedAgent?.name}
                agentIcon={selectedAgent?.icon}
                agentColor={selectedAgent?.color}
                showReasoning={config.showReasoning !== false}
                onRevert={handleRevert}
              />
            ))}
            <div className="h-4" />
          </div>
        </div>

        {/* Input area */}
        <div className="border-t border-border/50 bg-background/98 p-3 sm:p-4 shrink-0">
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Stop button */}
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

            {/* Toolbar: selectors on left, panel toggles on right */}
            <div className="flex items-center justify-between gap-2">
              {/* Selectors */}
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

              {/* Panel toggles */}
              {hasPanelButtons && (
                <div className="flex items-center gap-1 shrink-0">
                  {config.showTodos && (
                    <button
                      onClick={() => togglePanel('todos')}
                      className={cn(
                        'flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-medium transition-all shrink-0',
                        showSidePanel === 'todos'
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      <CheckSquare size={12} />
                      <span className="hidden xs:inline sm:inline">Tasks</span>
                      {todos.length > 0 && (
                        <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[9px] font-bold">
                          {todos.length}
                        </span>
                      )}
                    </button>
                  )}
                  {config.showArtifacts && (
                    <button
                      onClick={() => togglePanel('artifacts')}
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
                  )}
                </div>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground/50 px-0.5">
              AI can make mistakes. Double-check important information.
            </p>
          </div>
        </div>
      </div>

      {/* Desktop side panel */}
      {showSidePanel && !isMobile && !isFullscreen && (
        <div className="w-[400px] xl:w-[440px] border-l flex flex-col bg-background shrink-0">
          {panelHeader}
          <div className="flex-1 min-h-0 overflow-hidden">{panelContent}</div>
        </div>
      )}

      {/* Mobile bottom sheet */}
      {isMobile && (
        <Sheet
          open={!!showSidePanel}
          onOpenChange={(open) => !open && setShowSidePanel(null)}
        >
          <SheetContent
            side="bottom"
            className="h-[80vh] flex flex-col p-0 rounded-t-2xl"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>
                {showSidePanel === 'artifacts' ? 'Artifacts' : 'Tasks'}
              </SheetTitle>
            </SheetHeader>
            {panelHeader}
            <div className="flex-1 min-h-0 overflow-hidden">{panelContent}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
