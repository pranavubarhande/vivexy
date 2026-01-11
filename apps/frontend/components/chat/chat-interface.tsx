'use client';

import React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useChat,
  useCreateChat,
  useMessages,
  useLLMModels,
  useUpdateChatTitle,
  useUpdateMessage,
  useArtifacts,
  useSendMessageStreaming,
  useDownloadArtifact,
} from '@/hooks/useChat';
import { ROUTES } from '@/constants/routes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  MessageSquare,
  Send,
  Plus,
  Edit3,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Wrench,
  FileText,
  Copy,
  Download,
} from 'lucide-react';
import { MessageWithModel } from '@/services/chat.service';
import { Artifact } from '@prisma/client';
import { ArtifactContent } from '@/components/chat/artifact-content';
import { MarkdownRenderer } from '@/components/shared/markdown-renderer';
import { useResize } from '@/hooks/useResize';

// Constants
const STREAMING_TIMEOUT = 60000; // 60 seconds
const TEXTAREA_MIN_HEIGHT = 44;
const TEXTAREA_MAX_HEIGHT = 128;

// Types
interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: string;
}

interface ReasoningStep {
  thought: string;
  toolCalls?: ToolCall[];
}

interface StreamingMessage {
  id: string;
  content: string;
  reasoning: ReasoningStep[];
}

interface ChatInterfaceProps {
  selectedChatId?: string;
}

interface LLMModel {
  id: string;
  name: string;
}

interface MessageItemProps {
  message: MessageWithModel;
  editingMessageId: string | null;
  messageEditInput: string;
  messageEditModelId: string;
  models: LLMModel[];
  expandedReasoning: Record<string, boolean>;
  onStartEditing: (message: MessageWithModel) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleReasoning: (messageId: string) => void;
  onEditInputChange: (value: string) => void;
  onEditModelChange: (value: string) => void;
}
interface StreamingMessageProps {
  streamingMessage: StreamingMessage;
}
interface ArtifactItemProps {
  artifact: Artifact;
  onClick: (artifact: Artifact) => void;
}

export default function ChatInterface({
  selectedChatId: initialChatId,
}: ChatInterfaceProps) {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    initialChatId || null
  );
  const [messageInput, setMessageInput] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [streamingMessage, setStreamingMessage] =
    useState<StreamingMessage | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageEditInput, setMessageEditInput] = useState('');
  const [messageEditModelId, setMessageEditModelId] = useState<string>('');

  const { data: selectedChat } = useChat(selectedChatId || '');
  const { data: messages } = useMessages(selectedChatId || '');
  const { data: artifacts } = useArtifacts(selectedChatId || '');
  const { data: models } = useLLMModels();
  const { sendMessageStreaming } = useSendMessageStreaming();
  const downloadArtifact = useDownloadArtifact();
  const queryClient = useQueryClient();

  const createChat = useCreateChat();
  const updateChatTitle = useUpdateChatTitle();
  const updateMessage = useUpdateMessage();

  // Set default model from chat's last used model or fallback to first available
  useEffect(() => {
    if (selectedChat?.lastModelId) {
      setSelectedModelId(selectedChat.lastModelId);
    } else if (models && models.length > 0 && !selectedModelId) {
      setSelectedModelId(models[0].id);
    }
  }, [selectedChat, models, selectedModelId]);

  // Reasoning display state
  const [expandedReasoning, setExpandedReasoning] = useState<
    Record<string, boolean>
  >({});

  // Custom hooks
  const { rightPanelPercent, isResizing, startResize, containerRef } =
    useResize();

  // Selected artifact for viewing
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(
    null
  );

  // Memoize combined items for performance
  const combinedItems = useMemo(() => {
    const items: Array<
      | { type: 'message'; data: MessageWithModel }
      | { type: 'artifact'; data: Artifact }
    > = [];

    messages?.forEach((message) => {
      items.push({ type: 'message', data: message });
    });

    artifacts?.forEach((artifact) => {
      items.push({ type: 'artifact', data: artifact });
    });

    // Sort by creation time
    items.sort((a, b) => {
      const aTime = new Date(
        a.type === 'message' ? a.data.createdAt : a.data.createdAt
      ).getTime();
      const bTime = new Date(
        b.type === 'message' ? b.data.createdAt : b.data.createdAt
      ).getTime();
      return aTime - bTime;
    });

    return items;
  }, [messages, artifacts]);

  const handleCreateChat = async () => {
    try {
      const newChat = await createChat.mutateAsync({});
      setSelectedChatId(newChat.id);
      // Reset model selection for new chat
      setSelectedModelId('');
      // Navigate to the new chat
      window.location.href = ROUTES.chat(newChat.id);
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedChatId || !messageInput.trim() || isProcessing) return;

    const currentMessageInput = messageInput.trim();
    setError(null);
    setIsProcessing(true);
    setMessageInput(''); // Clear input immediately

    // Create streaming assistant message
    const streamingId = `streaming-${Date.now()}`;
    setStreamingMessage({
      id: streamingId,
      content: '',
      reasoning: [],
    });

    try {
      // Set a timeout to clear streaming message if it takes too long
      const timeout = setTimeout(() => {
        console.log('Streaming timeout reached, clearing streaming message');
        setStreamingMessage(null);
        queryClient.invalidateQueries({
          queryKey: ['messages', selectedChatId],
        });
      }, STREAMING_TIMEOUT);

      let streamEnded = false;
      for await (const event of sendMessageStreaming(selectedChatId, {
        role: 'USER',
        content: currentMessageInput,
        modelId: selectedModelId || undefined,
      })) {
        if (streamEnded) break;

        console.log('Received event:', event.type);

        if (event.type === 'user_message') {
          // User message created, invalidate to show it and re-enable input
          queryClient.invalidateQueries({
            queryKey: ['messages', selectedChatId],
          });
          setIsProcessing(false); // Allow new messages while streaming continues
        } else if (event.type === 'content') {
          setStreamingMessage((prev) =>
            prev
              ? {
                  ...prev,
                  content: prev.content + event.data,
                }
              : null
          );
        } else if (event.type === 'reasoning') {
          setStreamingMessage((prev) =>
            prev
              ? {
                  ...prev,
                  reasoning: [...prev.reasoning, event.data],
                }
              : null
          );
        } else if (event.type === 'assistant_message') {
          // Streaming complete, clear streaming message and refresh messages
          console.log('Assistant message received, clearing streaming');
          clearTimeout(timeout);
          setStreamingMessage(null);
          streamEnded = true;
        } else if (event.type === 'error') {
          clearTimeout(timeout);
          throw new Error(event.message || 'Streaming failed');
        }
      }

      // Clear timeout and fallback: clear streaming message when stream ends
      clearTimeout(timeout);
      console.log('Stream ended, clearing streaming message');
      setStreamingMessage(null);
    } catch (error) {
      console.error('Failed to send message:', error);
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to send message. Please try again.'
      );
      setMessageInput(currentMessageInput); // Restore input on error
      setStreamingMessage(null);
      setIsProcessing(false);
    }
  };

  const handleStartEditingTitle = () => {
    setTitleInput(selectedChat?.title || '');
    setEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    if (!selectedChatId || !titleInput.trim()) return;

    try {
      await updateChatTitle.mutateAsync({
        chatId: selectedChatId,
        title: titleInput.trim(),
      });
      setEditingTitle(false);
    } catch (error) {
      console.error('Failed to update title:', error);
    }
  };

  const handleCancelTitleEdit = () => {
    setEditingTitle(false);
    setTitleInput('');
  };

  const handleStartEditingMessage = (message: MessageWithModel) => {
    setEditingMessageId(message.id);
    setMessageEditInput(message.content);
    setMessageEditModelId(message.modelId || selectedModelId);
  };

  const handleSaveMessage = async () => {
    if (!selectedChatId || !editingMessageId || !messageEditInput.trim())
      return;

    try {
      await updateMessage.mutateAsync({
        chatId: selectedChatId,
        messageId: editingMessageId,
        content: messageEditInput.trim(),
        modelId: messageEditModelId,
      });
      setEditingMessageId(null);
      setMessageEditInput('');
      setMessageEditModelId('');
    } catch (error) {
      console.error('Failed to update message:', error);
    }
  };

  const handleCancelMessageEdit = () => {
    setEditingMessageId(null);
    setMessageEditInput('');
  };

  const handleCopyArtifactContent = async (content: string) => {
    await navigator.clipboard.writeText(content);
  };

  return (
    <div ref={containerRef} className="flex h-full bg-background select-none">
      {/* Chat Area */}
      <div
        className={`flex flex-col relative ${selectedArtifact ? '' : ''}`}
        style={
          selectedArtifact
            ? { flex: `0 0 ${100 - rightPanelPercent}%` }
            : { flex: '1 1 auto' }
        }
      >
        {selectedChatId ? (
          <>
            {/* Chat Header - Full Width */}
            <div className="w-full border-b bg-muted/10">
              <div className="mx-auto p-2">
                <div className="flex items-center gap-2 h-13">
                  <SidebarTrigger className="-ml-1" />
                  <div className="flex-1 flex items-center justify-between">
                    {editingTitle ? (
                      <div className="flex items-center space-x-2 flex-1">
                        <Input
                          value={titleInput}
                          onChange={(e) => setTitleInput(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') handleSaveTitle();
                            if (e.key === 'Escape') handleCancelTitleEdit();
                          }}
                          className="flex-1"
                          autoFocus
                        />
                        <Button
                          size="sm"
                          onClick={handleSaveTitle}
                          disabled={updateChatTitle.isPending}
                        >
                          <Check size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelTitleEdit}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <h2 className="text-sm font-semibold">
                          {selectedChat?.title || 'Chat'}
                        </h2>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleStartEditingTitle}
                          className="ml-2"
                        >
                          <Edit3 size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col h-full overflow-auto">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-5xl mx-auto p-4">
                  <div className="space-y-4">
                    {/* Render combined messages and artifacts */}
                    {combinedItems.map((item) => {
                      if (item.type === 'artifact') {
                        const artifact = item.data as Artifact;
                        return (
                          <ArtifactItem
                            key={`artifact-${artifact.id}`}
                            artifact={artifact}
                            onClick={setSelectedArtifact}
                          />
                        );
                      } else {
                        const message = item.data as MessageWithModel;
                        return (
                          <div key={message.id} className="flex justify-center">
                            <div className="max-w-5xl w-full">
                              <MessageItem
                                message={message}
                                editingMessageId={editingMessageId}
                                messageEditInput={messageEditInput}
                                messageEditModelId={messageEditModelId}
                                models={models || []}
                                expandedReasoning={expandedReasoning}
                                onStartEditing={handleStartEditingMessage}
                                onSaveEdit={handleSaveMessage}
                                onCancelEdit={handleCancelMessageEdit}
                                onToggleReasoning={(messageId) =>
                                  setExpandedReasoning((prev) => ({
                                    ...prev,
                                    [messageId]: !prev[messageId],
                                  }))
                                }
                                onEditInputChange={setMessageEditInput}
                                onEditModelChange={setMessageEditModelId}
                              />
                            </div>
                          </div>
                        );
                      }
                    })}
                    {streamingMessage && (
                      <StreamingMessageComponent
                        streamingMessage={streamingMessage}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Error Display */}
              {error && (
                <div className="p-4 border-t border-red-200 bg-red-50">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className="sticky bottom-0 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 border-t rounded-t-lg shadow-lg max-w-5xl min-w-5xl self-center mx-2">
              <div className="p-4 max-w-5xl mx-auto">
                {/* Top layer - Text input */}
                <div className="mb-3">
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Type your message..."
                    className="w-full p-3 border rounded-lg resize-none bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[44px] max-h-32 overflow-y-auto"
                    disabled={isProcessing}
                    rows={1}
                    style={{
                      height: 'auto',
                      minHeight: `${TEXTAREA_MIN_HEIGHT}px`,
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height =
                        Math.min(target.scrollHeight, TEXTAREA_MAX_HEIGHT) +
                        'px';
                    }}
                  />
                </div>

                {/* Bottom layer - Controls */}
                <div className="flex items-center justify-between">
                  <Select
                    value={selectedModelId}
                    onValueChange={setSelectedModelId}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models?.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim() || isProcessing}
                    size="sm"
                  >
                    {isProcessing ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">Welcome to Chat</h3>
              <p className="text-muted-foreground mb-4">
                Select a chat from the sidebar or create a new one to get
                started.
              </p>
              <Button
                onClick={handleCreateChat}
                disabled={createChat.isPending}
              >
                <Plus className="w-4 h-4 mr-2" />
                Start New Chat
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Artifact Viewer */}
      {selectedArtifact && (
        <>
          {/* Draggable Separator */}
          <div
            className={`relative w-1 bg-border cursor-col-resize ${isResizing ? 'bg-primary/40' : ''}`}
            onMouseDown={startResize}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -left-1.5 h-10 w-4 rounded-full bg-muted shadow border" />
          </div>
          <div
            className="border-l bg-muted/5 flex flex-col overflow-hidden"
            style={{ flex: `0 0 ${rightPanelPercent}%` }}
          >
            <div className="p-4 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileText size={16} className="text-muted-foreground" />
                  <div>
                    <h4 className="text-sm font-medium">
                      {selectedArtifact.title ||
                        `Artifact ${selectedArtifact.seq}`}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {selectedArtifact.type} •{' '}
                      {new Date(selectedArtifact.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedArtifact(null)}
                  className="h-6 w-6 p-0"
                >
                  <X size={14} />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <ArtifactContent artifact={selectedArtifact} />
              <div className="mt-4 flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleCopyArtifactContent(selectedArtifact.content)
                  }
                >
                  <Copy size={12} className="mr-1" />
                  Copy
                </Button>
                {selectedArtifact.type === 'MD' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        downloadArtifact.mutate({
                          artifact: selectedArtifact,
                          format: 'pdf',
                        })
                      }
                    >
                      <Download size={12} className="mr-1" />
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        downloadArtifact.mutate({
                          artifact: selectedArtifact,
                          format: 'docx',
                        })
                      }
                    >
                      <Download size={12} className="mr-1" />
                      Word
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const MessageItem: React.FC<MessageItemProps> = ({
  message,
  editingMessageId,
  messageEditInput,
  messageEditModelId,
  models,
  expandedReasoning,
  onStartEditing,
  onSaveEdit,
  onCancelEdit,
  onToggleReasoning,
  onEditInputChange,
  onEditModelChange,
}) => {
  if (editingMessageId === message.id) {
    return (
      <div className="p-3 rounded-xl bg-muted">
        <div className="mb-2">
          <Select value={messageEditModelId} onValueChange={onEditModelChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {models?.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <textarea
          value={messageEditInput}
          onChange={(e) => onEditInputChange(e.target.value)}
          className="w-full p-2 border rounded resize-none bg-background"
          rows={3}
          autoFocus
        />
        <div className="flex justify-end space-x-2 mt-2">
          <Button size="sm" onClick={onSaveEdit}>
            <Check size={12} />
          </Button>
          <Button size="sm" variant="outline" onClick={onCancelEdit}>
            <X size={12} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-full p-4 rounded-2xl transition-colors ${
        message.role === 'USER' ? 'bg-muted border' : 'bg-card border shadow-sm'
      }`}
      onDoubleClick={() => message.role === 'USER' && onStartEditing(message)}
    >
      {message.role === 'USER' ? (
        <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
          {message.content.split('\n').map((line, index) => {
            // Handle bullet points
            if (line.trim().startsWith('*') || line.trim().startsWith('-')) {
              return (
                <div key={index} className="flex items-start space-x-2">
                  <span className="text-muted-foreground mt-1">•</span>
                  <span>{line.trim().substring(1).trim()}</span>
                </div>
              );
            }
            // Handle numbered lists
            const numberedMatch = line.trim().match(/^(\d+)\.\s*(.+)$/);
            if (numberedMatch) {
              return (
                <div key={index} className="flex items-start space-x-2">
                  <span className="text-muted-foreground font-medium">
                    {numberedMatch[1]}.
                  </span>
                  <span>{numberedMatch[2]}</span>
                </div>
              );
            }
            // Regular text
            return line ? <div key={index}>{line}</div> : <br key={index} />;
          })}
        </div>
      ) : (
        <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
          <MarkdownRenderer>{message.content}</MarkdownRenderer>
        </div>
      )}
      <div className="flex items-center justify-between mt-1">
        {message.model && (
          <p className="text-xs opacity-70">{message.model.name}</p>
        )}
        {message.role === 'USER' && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onStartEditing(message);
            }}
            className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
          >
            <Edit3 size={10} />
          </Button>
        )}
        {message.role === 'ASSISTANT' && message.reasoning && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onToggleReasoning(message.id)}
            className="h-6 px-2 opacity-70 hover:opacity-100 text-xs"
          >
            <Wrench size={10} className="mr-1" />
            {expandedReasoning[message.id] ? (
              <ChevronDown size={10} />
            ) : (
              <ChevronRight size={10} />
            )}
          </Button>
        )}
      </div>

      {/* Agent Reasoning Display */}
      {message.role === 'ASSISTANT' &&
        message.reasoning &&
        expandedReasoning[message.id] && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg border-l-4 border-primary">
            <h4 className="text-sm font-medium mb-2 flex items-center">
              <Wrench size={14} className="mr-2" />
              Agent Reasoning
            </h4>
            <div className="space-y-2 text-xs">
              {Array.isArray(message.reasoning) &&
                message.reasoning.map((step, index: number) => (
                  <div
                    key={index}
                    className="border-l-2 border-muted-foreground/30 pl-3"
                  >
                    <div className="font-medium text-muted-foreground mb-1">
                      {step.thought}
                    </div>
                    {step.toolCalls && step.toolCalls.length > 0 && (
                      <div className="space-y-1">
                        {step.toolCalls.map(
                          (toolCall: ToolCall, toolIndex: number) => (
                            <div
                              key={toolIndex}
                              className="bg-background/50 p-2 rounded text-xs"
                            >
                              <div className="font-medium text-primary">
                                Used: {toolCall.tool}
                              </div>
                              <div className="text-muted-foreground mt-1">
                                Input: {JSON.stringify(toolCall.input, null, 2)}
                              </div>
                              {toolCall.output && (
                                <div className="text-muted-foreground mt-1">
                                  Output:{' '}
                                  {typeof toolCall.output === 'string'
                                    ? toolCall.output
                                    : JSON.stringify(toolCall.output, null, 2)}
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
    </div>
  );
};

const StreamingMessageComponent: React.FC<StreamingMessageProps> = ({
  streamingMessage,
}) => (
  <div className="flex justify-center">
    <div className="max-w-5xl w-full">
      <div className="p-4 rounded-2xl bg-card border shadow-sm">
        <div className="flex items-center space-x-2 mb-2">
          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
          <p className="text-xs text-muted-foreground">Agent is thinking...</p>
        </div>
        <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
          <MarkdownRenderer>
            {streamingMessage.content || 'Analyzing your request...'}
          </MarkdownRenderer>
        </div>
        {streamingMessage.reasoning &&
          streamingMessage.reasoning.length > 0 && (
            <div className="mt-3 p-3 bg-muted/50 rounded-lg border-l-4 border-primary">
              <h4 className="text-sm font-medium mb-2 flex items-center">
                <Wrench size={14} className="mr-2" />
                Agent Reasoning
              </h4>
              <div className="space-y-2 text-xs">
                {streamingMessage.reasoning.map((step, index) => (
                  <div
                    key={index}
                    className="border-l-2 border-muted-foreground/30 pl-3"
                  >
                    <div className="font-medium text-muted-foreground mb-1">
                      {step.thought}
                    </div>
                    {step.toolCalls && step.toolCalls.length > 0 && (
                      <div className="space-y-1">
                        {step.toolCalls.map(
                          (toolCall: ToolCall, toolIndex: number) => (
                            <div
                              key={toolIndex}
                              className="bg-background/50 p-2 rounded text-xs"
                            >
                              <div className="font-medium text-primary">
                                Used: {toolCall.tool}
                              </div>
                              <div className="text-muted-foreground mt-1">
                                Input: {JSON.stringify(toolCall.input, null, 2)}
                              </div>
                              {toolCall.output && (
                                <div className="text-muted-foreground mt-1">
                                  Output:{' '}
                                  {typeof toolCall.output === 'string'
                                    ? toolCall.output
                                    : JSON.stringify(toolCall.output, null, 2)}
                                </div>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
      </div>
    </div>
  </div>
);

const ArtifactItem: React.FC<ArtifactItemProps> = ({ artifact, onClick }) => (
  <div className="flex justify-center">
    <div className="max-w-5xl w-full">
      <div
        className="w-full p-3 rounded-xl cursor-pointer hover:bg-blue-50/70 transition-colors bg-white border shadow-sm"
        onClick={() => onClick(artifact)}
      >
        <div className="flex items-center space-x-2">
          <FileText size={16} className="text-muted-foreground" />
          <div className="flex-1">
            <h4 className="text-sm font-medium">
              {artifact.title || `Artifact ${artifact.seq}`}
            </h4>
            <p className="text-xs text-muted-foreground">
              {artifact.type} • Click to open
            </p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground" />
        </div>
      </div>
    </div>
  </div>
);
