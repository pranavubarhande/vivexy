'use client';

import { useState, useEffect } from 'react';
import {
  useChat,
  useCreateChat,
  useMessages,
  useSendMessage,
  useLLMModels,
  useUpdateChatTitle,
  useUpdateMessage,
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
import { MessageSquare, Send, Plus, Edit3, Check, X } from 'lucide-react';
import { MessageWithModel } from '@/services/chat.service';
import ReactMarkdown from 'react-markdown';

interface ChatInterfaceProps {
  selectedChatId?: string;
}

export default function ChatInterface({
  selectedChatId: initialChatId,
}: ChatInterfaceProps) {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    initialChatId || null
  );
  const [messageInput, setMessageInput] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string>('');

  const { data: selectedChat } = useChat(selectedChatId || '');
  const { data: messages } = useMessages(selectedChatId || '');
  const { data: models } = useLLMModels();

  // Set default model from chat's last used model or fallback to first available
  useEffect(() => {
    if (selectedChat?.lastModelId) {
      setSelectedModelId(selectedChat.lastModelId);
    } else if (models && models.length > 0 && !selectedModelId) {
      setSelectedModelId(models[0].id);
    }
  }, [selectedChat, models, selectedModelId]);
  const createChat = useCreateChat();
  const sendMessage = useSendMessage();
  const updateChatTitle = useUpdateChatTitle();
  const updateMessage = useUpdateMessage();

  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageEditInput, setMessageEditInput] = useState('');
  const [messageEditModelId, setMessageEditModelId] = useState<string>('');

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
    if (!selectedChatId || !messageInput.trim()) return;

    const currentMessageInput = messageInput.trim();
    setError(null);
    setIsGenerating(true);

    try {
      await sendMessage.mutateAsync({
        chatId: selectedChatId,
        data: {
          role: 'USER',
          content: currentMessageInput,
          modelId: selectedModelId || undefined,
        },
      });
      setMessageInput('');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Failed to send message:', error);
      setError(error.message || 'Failed to send message. Please try again.');
      // Keep the message input on error
      setMessageInput(currentMessageInput);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
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

  return (
    <div className="flex h-full bg-background">
      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedChatId ? (
          <>
            {/* Chat Header */}
            <div className="p-2 border-b bg-muted/10">
              <div className="flex items-center gap-2">
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

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                {messages?.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'USER' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className="max-w-[70%]">
                      {editingMessageId === message.id ? (
                        <div className="p-3 rounded-lg bg-muted">
                          <div className="mb-2">
                            <Select
                              value={messageEditModelId}
                              onValueChange={setMessageEditModelId}
                            >
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
                            onChange={(e) =>
                              setMessageEditInput(e.target.value)
                            }
                            className="w-full p-2 border rounded resize-none bg-background"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex justify-end space-x-2 mt-2">
                            <Button size="sm" onClick={handleSaveMessage}>
                              <Check size={12} />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelMessageEdit}
                            >
                              <X size={12} />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`p-3 rounded-lg cursor-pointer hover:opacity-80 transition-opacity ${
                            message.role === 'USER'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                          onDoubleClick={() =>
                            message.role === 'USER' &&
                            handleStartEditingMessage(message)
                          }
                        >
                          {message.role === 'USER' ? (
                            <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
                              {message.content
                                .split('\n')
                                .map((line, index) => {
                                  // Handle bullet points
                                  if (
                                    line.trim().startsWith('*') ||
                                    line.trim().startsWith('-')
                                  ) {
                                    return (
                                      <div
                                        key={index}
                                        className="flex items-start space-x-2"
                                      >
                                        <span className="text-muted-foreground mt-1">
                                          •
                                        </span>
                                        <span>
                                          {line.trim().substring(1).trim()}
                                        </span>
                                      </div>
                                    );
                                  }
                                  // Handle numbered lists
                                  const numberedMatch = line
                                    .trim()
                                    .match(/^(\d+)\.\s*(.+)$/);
                                  if (numberedMatch) {
                                    return (
                                      <div
                                        key={index}
                                        className="flex items-start space-x-2"
                                      >
                                        <span className="text-muted-foreground font-medium">
                                          {numberedMatch[1]}.
                                        </span>
                                        <span>{numberedMatch[2]}</span>
                                      </div>
                                    );
                                  }
                                  // Regular text
                                  return line ? (
                                    <div key={index}>{line}</div>
                                  ) : (
                                    <br key={index} />
                                  );
                                })}
                            </div>
                          ) : (
                            <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
                              <ReactMarkdown
                                components={{
                                  p: ({ children }) => (
                                    <p className="mb-2 last:mb-0">{children}</p>
                                  ),
                                  ul: ({ children }) => (
                                    <ul className="list-disc list-inside mb-2 space-y-1">
                                      {children}
                                    </ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol className="list-decimal list-inside mb-2 space-y-1">
                                      {children}
                                    </ol>
                                  ),
                                  li: ({ children }) => (
                                    <li className="ml-4">{children}</li>
                                  ),
                                  strong: ({ children }) => (
                                    <strong className="font-semibold">
                                      {children}
                                    </strong>
                                  ),
                                  em: ({ children }) => (
                                    <em className="italic">{children}</em>
                                  ),
                                  code: ({ children }) => (
                                    <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                                      {children}
                                    </code>
                                  ),
                                  pre: ({ children }) => (
                                    <pre className="bg-muted p-2 rounded text-xs font-mono overflow-x-auto">
                                      {children}
                                    </pre>
                                  ),
                                }}
                              >
                                {message.content}
                              </ReactMarkdown>
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-1">
                            {message.model && (
                              <p className="text-xs opacity-70">
                                {message.model.name}
                              </p>
                            )}
                            {message.role === 'USER' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEditingMessage(message);
                                }}
                                className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                              >
                                <Edit3 size={10} />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isGenerating && (
                  <div className="flex justify-start">
                    <div className="max-w-[70%] p-3 rounded-lg bg-muted">
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        <p className="text-sm text-muted-foreground">
                          Generating response...
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-4 border-t border-red-200 bg-red-50">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Message Input */}
            <div className="p-4 border-t bg-muted/10">
              <div className="flex space-x-2">
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

                <Input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  className="flex-1"
                  disabled={sendMessage.isPending || isGenerating}
                />

                <Button
                  onClick={handleSendMessage}
                  disabled={
                    !messageInput.trim() ||
                    sendMessage.isPending ||
                    isGenerating
                  }
                >
                  {isGenerating ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
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
    </div>
  );
}
