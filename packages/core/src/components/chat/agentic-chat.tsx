'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@vivexy/ui/utils';
import { toast } from 'sonner';

import { AgentSelector } from '@vivexy/core/chat/agent-selector';
import { ModelSelector } from '@vivexy/core/chat/model-selector';
import { ChatInput } from '@vivexy/core/chat/chat-input';
import { ChatHeader } from '@vivexy/core/chat/chat-header';
import { ChatMessageList } from '@vivexy/core/chat/chat-message-list';
import { ChatPanels } from '@vivexy/core/chat/chat-panels';
import { ApprovalDialog } from '@vivexy/core/chat/approval-dialog';
import { FormQuestionCard } from '@vivexy/core/chat/form-question-card';
import { UploadedFile } from '@vivexy/core/chat/file-upload';
import { RevertDialog, type RevertMode } from '@vivexy/core/chat/revert-dialog';
import { platform } from '@vivexy/core/lib/platform';

import {
  useChat,
  useChatHistory,
  useChatProject,
  useModels,
} from '@vivexy/core/hooks/useChat';
import { useAddChatToProject } from '@vivexy/core/hooks/useProjects';
import { NO_PROJECT_FILTER } from '@vivexy/core/chat/chat-header';
import { useChatStream } from '@vivexy/core/hooks/use-chat-stream';
import { useWorkspace } from '@vivexy/core/desktop/workspace-provider';
import { useAuthSafe } from '@vivexy/core/shared/auth-provider';
import { useGitContext } from '@vivexy/core/hooks/useGitContext';

import {
  Artifact,
  LLMModel,
  Message,
  chatService,
} from '@vivexy/core/services/chat.service';
import { File } from 'lucide-react';
import type { PanelType } from '@vivexy/core/chat/chat-panels';

function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.341-3.369-1.341-.454-1.154-1.11-1.461-1.11-1.461-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { AgentSummary } from '@vivexy/core/types/agent';

export interface AgenticChatConfig {
  availableAgents: AgentSummary[];
  defaultAgentId?: string;
  allowFileUpload?: boolean;
  showArtifacts?: boolean;
  showReasoning?: boolean;
  className?: string;
  basePath?: string;
  hideChatHeader?: boolean;
}

interface AgenticChatProps {
  config: AgenticChatConfig;
  initialChatId?: string;
  onChatCreated?: (chatId: string) => void;
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
// Toolbar — shared between empty state and active chat
// ---------------------------------------------------------------------------

interface ChatInputToolbarProps {
  agents: AgentSummary[];
  selectedAgentId: string;
  onAgentSelect: (id: string) => void;
  models: import('@vivexy/core/services/chat.service').LLMModel[];
  isLoadingModels: boolean;
  selectedModelDbId: string | null;
  onModelSelect: (
    dbId: string,
    provider: string,
    modelId: string,
    name: string
  ) => void;
  isStreaming: boolean;
  showArtifactsButton?: boolean;
  artifactsCount?: number;
  showSidePanel?: PanelType;
  onToggleArtifacts?: () => void;
  onToggleGithub?: () => void;
}

function ChatInputToolbar({
  agents,
  selectedAgentId,
  onAgentSelect,
  models,
  isLoadingModels,
  selectedModelDbId,
  onModelSelect,
  isStreaming,
  showArtifactsButton,
  artifactsCount,
  showSidePanel,
  onToggleArtifacts,
  onToggleGithub,
}: ChatInputToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/40">
      <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
        <AgentSelector
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelect={onAgentSelect}
          disabled={isStreaming}
        />
        <div className="w-px h-3.5 bg-border/60 shrink-0" />
        <ModelSelector
          models={models}
          isLoading={isLoadingModels}
          selectedModelId={selectedModelDbId}
          onSelect={onModelSelect}
          disabled={isStreaming}
        />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {showArtifactsButton && (
          <button
            onClick={onToggleArtifacts}
            className={cn(
              'flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-medium transition-all',
              showSidePanel === 'artifacts'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <File size={12} />
            <span className="hidden xs:inline sm:inline">Files</span>
            {!!artifactsCount && artifactsCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[9px] font-bold">
                {artifactsCount}
              </span>
            )}
          </button>
        )}
        {onToggleGithub && (
          <button
            onClick={onToggleGithub}
            className={cn(
              'flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-medium transition-all',
              showSidePanel === 'github'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
            title="GitHub repositories"
          >
            <GitHubIcon size={12} />
            <span className="hidden xs:inline sm:inline">GitHub</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AgenticChat = ({
  config,
  initialChatId,
  onChatCreated,
}: AgenticChatProps) => {
  // ---- Chat ID ----
  // Initialized from prop (passed by server component from searchParams).
  // After that, chatId is managed imperatively.
  const [chatId, setChatId] = useState<string | null>(
    () => initialChatId || null
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
  const [showSidePanel, setShowSidePanel] = useState<PanelType>(null);

  // ---- Auth ----
  const { user } = useAuthSafe();
  const firstName = user?.name?.split(' ')[0] ?? '';

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
    chatDetail,
    revertToMessage,
    isReverting,
    createArtifact,
    isLoadingMessages,
  } = useChat(chatId || undefined);

  // ---- Selected project (persisted to localStorage) ----
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    () => {
      if (typeof window === 'undefined') return null;
      return localStorage.getItem('ph-selected-project');
    }
  );
  const addChatToProject = useAddChatToProject();
  const { data: chatProject } = useChatProject(chatId ?? undefined);

  // When an existing chat is loaded, sync its project into state
  // Skip if the user has explicitly chosen the 'no project' filter view
  useEffect(() => {
    if (!chatId || chatProject === undefined) return;
    if (selectedProjectId === NO_PROJECT_FILTER) return;
    const pid = chatProject?.id ?? null;
    setSelectedProjectId(pid);
    if (pid) localStorage.setItem('ph-selected-project', pid);
    else localStorage.removeItem('ph-selected-project');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, chatProject]);

  const handleProjectChange = useCallback((projectId: string | null) => {
    setSelectedProjectId(projectId);
    if (projectId) localStorage.setItem('ph-selected-project', projectId);
    else localStorage.removeItem('ph-selected-project');
  }, []);

  // ---- Workspace ----
  const { refreshWorkspaceInfo, workspacePath } = useWorkspace();
  const qc = useQueryClient();
  const prevWorkspaceRef = useRef(workspacePath);

  // ---- Git / repo context ----
  const { context: gitContext, setContext: setGitContext } =
    useGitContext(workspacePath);

  // Per-chat context lock — keyed by chatId, persisted to localStorage.
  // We write it immediately when a message is sent so the lock is instant,
  // not dependent on a server refetch. The DB column is the server-side source
  // of truth for page reloads; this state handles the in-session UX.
  const [chatContextMap, setChatContextMap] = useState<
    Record<string, import('@vivexy/core/types/chat').GitContext>
  >(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem('vivexy-chat-contexts') ?? '{}');
    } catch {
      return {};
    }
  });

  const lockContextToChat = useCallback(
    (id: string, ctx: import('@vivexy/core/types/chat').GitContext | null) => {
      if (!id || !ctx) return;
      setChatContextMap((prev) => {
        if (prev[id]) return prev; // already locked — never overwrite
        const next = { ...prev, [id]: ctx };
        try {
          localStorage.setItem('vivexy-chat-contexts', JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    []
  );

  // lockedContext: in-memory map first, then DB value as page-refresh fallback.
  // We never call setState here — chatDetail is read-only for derivation.
  const lockedContext = chatId
    ? (chatContextMap[chatId] ?? chatDetail?.githubContext ?? null)
    : null;
  const effectiveGitContext = lockedContext ?? gitContext;
  const chatContextLocked = !!lockedContext;

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
  const [streamingMessages, setStreamingMessages] = useState<Message[]>([]);

  const {
    isStreaming,
    isWaitingApproval,
    approvalRequest,
    formQuestion,
    isCreatingChatRef,
    isStreamingRef,
    sendMessage,
    stopStreaming,
    handleApprove,
    handleReject,
    handleFormSubmit,
    patchArtifact,
  } = useChatStream({
    messages,
    refetchHistory,
    onStreamEnd: refreshWorkspaceInfo,
    setStreamingMessages,
  });

  // Merge TQ-backed messages with live streaming messages.
  const displayMessages = useMemo(() => {
    if (streamingMessages.length === 0) return messages;
    const ids = new Set(streamingMessages.map((m: Message) => m.id));
    return [
      ...messages.filter((m: Message) => !ids.has(m.id)),
      ...streamingMessages,
    ];
  }, [messages, streamingMessages]);

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
    // Clear any pending fill-value so it doesn't re-populate after the component re-mounts
    setFillValue(undefined);

    // Intercept /compact command
    const compactMatch = content.trim().match(/^\/compact\s*(.*)?$/i);
    if (compactMatch) {
      if (!chatId) {
        toast.error('No active chat to compact. Start a conversation first.');
        return;
      }
      const focus = compactMatch[1]?.trim() || undefined;
      try {
        toast.info('Compacting conversation…');
        const result = await chatService.compactChat(chatId, {
          focus,
          modelId: selectedModelId ?? undefined,
          modelProvider: selectedProvider || undefined,
        });
        toast.success(
          `Context compacted — ${result.compactedCount} messages summarized`
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        const errorMsg =
          err.response?.data?.error ||
          (err instanceof Error ? err.message : 'Compaction failed');
        toast.error(errorMsg);
      }
      return;
    }

    // Lock the context to the existing chat on first send
    if (chatId && effectiveGitContext)
      lockContextToChat(chatId, effectiveGitContext);

    // Snapshot the git state before the agent acts (desktop only, best-effort)
    await takeAndStorePendingSnapshot();

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
      githubContext: effectiveGitContext,
      createChat: apiCreateChat,
      onChatCreated: (id) => {
        setChatId(id);
        if (effectiveGitContext) lockContextToChat(id, effectiveGitContext);
        // Auto-assign to the currently selected project (normal chat page only, not the 'none' sentinel)
        if (
          !config.hideChatHeader &&
          selectedProjectId &&
          selectedProjectId !== NO_PROJECT_FILTER
        ) {
          addChatToProject.mutate({ projectId: selectedProjectId, chatId: id });
        }
        onChatCreated?.(id);
      },
      onUserMessageReady: (userMessageId) => {
        if (pendingSnapshotRef.current) {
          saveSnapshot(userMessageId, pendingSnapshotRef.current);
          pendingSnapshotRef.current = null;
        }
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

  // ---- Git snapshots (per user-message, stored in localStorage) ----
  type GitSnapshot = { sha: string; workspacePath: string; branch: string };

  const getSnapshots = useCallback((): Record<string, GitSnapshot> => {
    if (!chatId) return {};
    try {
      return JSON.parse(localStorage.getItem(`ph-snapshots-${chatId}`) ?? '{}');
    } catch {
      return {};
    }
  }, [chatId]);

  const saveSnapshot = useCallback(
    (userMessageId: string, snap: GitSnapshot) => {
      if (!chatId) return;
      const key = `ph-snapshots-${chatId}`;
      const existing = (() => {
        try {
          return JSON.parse(localStorage.getItem(key) ?? '{}');
        } catch {
          return {};
        }
      })();
      localStorage.setItem(
        key,
        JSON.stringify({ ...existing, [userMessageId]: snap })
      );
    },
    [chatId]
  );

  // Holds the snapshot taken right before a send, until we know the real message ID
  const pendingSnapshotRef = useRef<GitSnapshot | null>(null);

  const takeAndStorePendingSnapshot = useCallback(async () => {
    if (!platform.isDesktop) return;
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api?.snapshotGit || !effectiveGitContext?.workspacePath) return;
    const sha = await api
      .snapshotGit(effectiveGitContext.workspacePath)
      .catch(() => '');
    if (sha) {
      pendingSnapshotRef.current = {
        sha,
        workspacePath: effectiveGitContext.workspacePath,
        branch: effectiveGitContext.branch,
      };
    }
  }, [effectiveGitContext?.workspacePath, effectiveGitContext?.branch]);

  // ---- Revert dialog state ----
  const [revertTarget, setRevertTarget] = useState<{
    messageId: string;
    content: string;
  } | null>(null);

  const handleRevert = (messageId: string, content: string) => {
    setRevertTarget({ messageId, content });
  };

  const handleRevertConfirm = async (mode: RevertMode) => {
    if (!chatId || !revertTarget) return;
    const { messageId, content } = revertTarget;
    const snap = getSnapshots()[messageId];

    try {
      if (mode === 'code' || mode === 'both') {
        const api =
          typeof window !== 'undefined' ? window.electronAPI : undefined;
        if (api?.restoreGitSnapshot && snap) {
          const result = await api.restoreGitSnapshot(
            snap.workspacePath,
            snap.sha
          );
          if (result.error) {
            toast.error(`Code revert failed: ${result.error}`);
            return;
          }
        }
      }

      if (mode === 'messages' || mode === 'both') {
        await revertToMessage({ messageId, deleteSelf: true });
        setFillValue(content);
        toast.success(
          mode === 'both'
            ? 'Code reverted and conversation rewound'
            : 'Conversation rewound — edit and resend'
        );
      } else {
        toast.success('Code reverted to state before this message');
      }
    } catch (err) {
      console.error('Revert failed:', err);
      toast.error('Revert failed');
    } finally {
      setRevertTarget(null);
    }
  };

  const toggleArtifactsPanel = () => {
    setShowSidePanel((p) => (p === 'artifacts' ? null : 'artifacts'));
  };

  const toggleGithubPanel = () => {
    setShowSidePanel((p) => (p === 'github' ? null : 'github'));
  };

  // ---- Derived ----
  const isEmpty = displayMessages.length === 0 && !isLoadingMessages;
  const [fillValue, setFillValue] = useState<string | undefined>();

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
      {/* Revert dialog */}
      <RevertDialog
        open={!!revertTarget}
        messagePreview={revertTarget?.content ?? ''}
        hasGitSnapshot={
          revertTarget ? !!getSnapshots()[revertTarget.messageId] : false
        }
        isReverting={isReverting}
        onConfirm={handleRevertConfirm}
        onClose={() => setRevertTarget(null)}
      />

      {/* Approval dialog */}
      <ApprovalDialog
        open={!!approvalRequest}
        request={approvalRequest}
        onApprove={(reqId) => handleApprove(chatId, reqId)}
        onReject={(reqId) => handleReject(chatId, reqId)}
      />

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {!config.hideChatHeader && (
          <ChatHeader
            chats={chats}
            chatId={chatId}
            isStreaming={isStreaming}
            basePath={config.basePath}
            onChatSelect={handleChatSelect}
            onChatDelete={handleChatDelete}
            onNewChat={handleNewChat}
            selectedProjectId={selectedProjectId}
            onProjectChange={handleProjectChange}
          />
        )}

        {isEmpty ? (
          /* ── Empty state: greeting + single bordered box ── */
          <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 animate-in fade-in duration-500">
            <div className="w-full max-w-2xl">
              {/* Greeting */}
              <h1 className="text-3xl font-serif font-light tracking-tight text-center mb-6">
                {getGreeting()}
                {firstName ? `, ${firstName}` : ''}
              </h1>

              {/* Single bordered container */}
              <div className="rounded-2xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all overflow-hidden">
                <ChatInput
                  onSend={handleSend}
                  chatId={chatId || undefined}
                  disabled={isStreaming || isWaitingApproval}
                  showFileUpload={config.allowFileUpload !== false}
                  placeholder="How can I help you today?"
                  className="border-0 shadow-none rounded-none"
                  fillValue={fillValue}
                />
                <ChatInputToolbar
                  agents={config.availableAgents}
                  selectedAgentId={selectedAgentId}
                  onAgentSelect={setSelectedAgentId}
                  models={models}
                  isLoadingModels={isLoadingModels}
                  selectedModelDbId={selectedModelDbId}
                  onModelSelect={handleModelSelect}
                  isStreaming={isStreaming}
                  showSidePanel={showSidePanel}
                  onToggleGithub={toggleGithubPanel}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 custom-scrollbar chat-bg-pattern">
              <div className="max-w-3xl mx-auto space-y-6">
                <ChatMessageList
                  messages={displayMessages}
                  showReasoning={config.showReasoning !== false}
                  isLoading={isLoadingMessages}
                  onRevert={handleRevert}
                />
              </div>
            </div>

            {/* Form question — inline card above input */}
            {formQuestion && (
              <div className="px-4 sm:px-6 pb-2">
                <div className="max-w-3xl mx-auto">
                  <FormQuestionCard
                    request={formQuestion}
                    onSubmit={handleFormSubmit}
                  />
                </div>
              </div>
            )}

            {/* Input area */}
            <div className="border-t border-border/50 bg-background/98 p-3 sm:p-4 shrink-0">
              <div className="max-w-3xl mx-auto">
                {/* Single bordered box — same as empty state */}
                <div className="rounded-2xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all overflow-hidden">
                  <ChatInput
                    onSend={handleSend}
                    onStop={stopStreaming}
                    isGenerating={isStreaming}
                    chatId={chatId || undefined}
                    disabled={isWaitingApproval || !!formQuestion}
                    showFileUpload={config.allowFileUpload !== false}
                    fillValue={fillValue}
                    placeholder={
                      isWaitingApproval
                        ? 'Waiting for your approval…'
                        : formQuestion
                          ? 'Fill out the form above to continue…'
                          : 'Reply…'
                    }
                    className="border-0 shadow-none rounded-none"
                  />
                  <ChatInputToolbar
                    agents={config.availableAgents}
                    selectedAgentId={selectedAgentId}
                    onAgentSelect={setSelectedAgentId}
                    models={models}
                    isLoadingModels={isLoadingModels}
                    selectedModelDbId={selectedModelDbId}
                    onModelSelect={handleModelSelect}
                    isStreaming={isStreaming}
                    showArtifactsButton={config.showArtifacts}
                    artifactsCount={artifacts.length}
                    showSidePanel={showSidePanel}
                    onToggleArtifacts={toggleArtifactsPanel}
                    onToggleGithub={toggleGithubPanel}
                  />
                </div>

                <div className="flex justify-center pt-2">
                  <p className="text-[10px] text-muted-foreground/50 text-center">
                    AI can make mistakes. Double-check important information.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Side panels */}
      <ChatPanels
        showSidePanel={showSidePanel}
        setShowSidePanel={setShowSidePanel}
        artifacts={artifacts}
        onSaveArtifact={handleSaveArtifact}
        activeGitContext={effectiveGitContext}
        onGitContextChange={setGitContext}
        chatContextLocked={chatContextLocked}
      />
    </div>
  );
};
