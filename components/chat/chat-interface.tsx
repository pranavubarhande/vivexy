'use client';

import { useState, useEffect, useRef } from 'react';
import {
  useChat,
  useCreateChat,
  useMessages,
  useSendMessage,
  useLLMModels,
  useUpdateChatTitle,
  useUpdateMessage,
} from '@/hooks/useChat';
import { useStocks } from '@/hooks/useStocks';
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
import { MessageSquare, Send, Plus, Edit3, Check, X, Database } from 'lucide-react';
import { MessageWithModel } from '@/services/chat.service';
import ReactMarkdown from 'react-markdown';
import axiosInstance from '@/services/axiosInstance.service';

interface ChatInterfaceProps {
  selectedChatId?: string;
}

interface ContextData {
  type: string;
  subtype?: string;
  stock: string;
  parameters?: Record<string, string | number>;
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

  // Context selection state
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [contextData, setContextData] = useState<ContextData | null>(null);
  const [contextContent, setContextContent] = useState<string>('');
  const [contextStep, setContextStep] = useState<'type' | 'subtype' | 'stock' | 'parameters'>('type');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedSubtype, setSelectedSubtype] = useState<string>('');
  const [selectedStock, setSelectedStock] = useState<string>('');
  const [contextParameters, setContextParameters] = useState<Record<string, string>>({});
  const [stockSearchQuery, setStockSearchQuery] = useState<string>('');

  const { stocks: contextStocks } = useStocks(stockSearchQuery, 1, 5); // Get filtered stocks for context selection

  const inputRef = useRef<HTMLInputElement>(null);

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
      // If there's context data, include the pre-fetched context content
      let finalContent = currentMessageInput;
      if (contextData && contextContent) {
        finalContent = `${currentMessageInput}\n\nContext:\n${contextContent}`;
      }

      await sendMessage.mutateAsync({
        chatId: selectedChatId,
        data: {
          role: 'USER',
          content: finalContent,
          modelId: selectedModelId || undefined,
        },
      });
      setMessageInput('');
      setContextData(null); // Clear context after sending
      setContextContent(''); // Clear context content after sending
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
    } else if (e.key === '@' && !showContextSelector) {
      e.preventDefault();
      setShowContextSelector(true);
      setContextStep('type');
      setSelectedType('');
      setSelectedSubtype('');
      setSelectedStock('');
      setContextParameters({});
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

  const handleContextButtonClick = () => {
    setShowContextSelector(true);
    setContextStep('type');
    setSelectedType('');
    setSelectedSubtype('');
    setSelectedStock('');
    setContextParameters({});
  };

  const handleTypeSelect = (type: string) => {
    setSelectedType(type);
    if (type === 'fundamentals') {
      setContextStep('stock');
    } else if (type === 'news') {
      setContextStep('stock');
    } else if (type === 'quote') {
      setContextStep('stock');
    } else if (type === 'yfinance') {
      setContextStep('subtype');
    }
  };

  const handleSubtypeSelect = (subtype: string) => {
    setSelectedSubtype(subtype);
    setContextStep('stock');
  };

  const handleStockSelect = (stock: string) => {
    setSelectedStock(stock);
    if (selectedType === 'news') {
      setContextStep('parameters');
    } else if (selectedType === 'quote') {
      setContextStep('parameters');
    } else if (selectedType === 'yfinance' && selectedSubtype === 'quoteSummary') {
      setContextStep('parameters');
    } else if (selectedType === 'yfinance' && selectedSubtype === 'historical') {
      setContextStep('parameters');
    } else if (selectedType === 'yfinance' && selectedSubtype === 'search') {
      setContextStep('parameters');
    } else {
      handleContextComplete();
    }
  };

  const handleParameterChange = (key: string, value: string) => {
    setContextParameters(prev => ({ ...prev, [key]: value }));
  };

  const handleContextComplete = async () => {
    try {
      const params: Record<string, string | number> = {};
      if (selectedType === 'news' && contextParameters.count) {
        params.count = parseInt(contextParameters.count);
      }
      if (selectedType === 'quote') {
        if (contextParameters.interval) params.interval = contextParameters.interval;
        if (contextParameters.days) params.days = parseInt(contextParameters.days);
      }
      if (selectedType === 'yfinance') {
        if (selectedSubtype === 'quoteSummary' && contextParameters.modules) {
          params.modules = contextParameters.modules;
        }
        if (selectedSubtype === 'historical') {
          if (contextParameters.interval) params.interval = contextParameters.interval;
          if (contextParameters.days) params.days = parseInt(contextParameters.days);
        }
        if (selectedSubtype === 'search' && contextParameters.q) {
          params.q = contextParameters.q;
        }
      }

      const context: ContextData = {
        type: selectedType,
        subtype: selectedSubtype || undefined,
        stock: selectedStock,
        parameters: Object.keys(params).length > 0 ? params : undefined,
      };

      // Fetch context data immediately
      const response = await axiosInstance.get('/stocks/context', {
        params: {
          type: context.type,
          subtype: context.subtype,
          stock: context.stock,
          parameters: context.parameters ? JSON.stringify(context.parameters) : undefined,
        },
      });

      const contextText = formatContextData(response.data);

      setContextData(context);
      setContextContent(contextText);
      setShowContextSelector(false);

      // Create compact preview for input
      const previewText = createContextPreview(context);
      const newMessage = `@${context.stock} ${previewText}`;
      setMessageInput(prev => prev + newMessage);
      inputRef.current?.focus();
    } catch (error) {
      console.error('Error fetching context:', error);
      setError('Failed to fetch context data');
    }
  };

  const createContextPreview = (context: ContextData): string => {
    const typeLabel = selectedType === 'fundamentals' ? 'Fundamentals' :
                     selectedType === 'news' ? 'News' :
                     selectedType === 'quote' ? 'Quote' :
                     selectedType === 'yfinance' ? `${selectedSubtype}` : selectedType;

    let params = '';
    if (context.parameters) {
      if (context.type === 'news' && context.parameters.count) {
        params = ` (${context.parameters.count} articles)`;
      } else if (context.type === 'quote') {
        params = ` (${context.parameters.days} days, ${context.parameters.interval})`;
      } else if (context.type === 'yfinance' && context.subtype === 'historical') {
        params = ` (${context.parameters.days} days, ${context.parameters.interval})`;
      }
    }

    return `${typeLabel}${params}`;
  };

  const formatContextData = (data: Record<string, unknown>): string => {
    if (data.type === 'fundamentals') {
      return `Fundamentals: ${JSON.stringify(data.data, null, 2)}`;
    }
    if (data.type === 'news') {
      const newsData = data.data as Array<{ title: string }>;
      return `News (${data.count} articles): ${newsData.map((item) => `- ${item.title}`).join('\n')}`;
    }
    if (data.type === 'quote') {
      const quoteData = data.data as unknown[];
      return `Quote data (${data.days} days, ${data.interval}): ${quoteData.length} data points`;
    }
    if (data.type === 'yfinance') {
      return `${data.subtype} data: ${JSON.stringify(data.data, null, 2)}`;
    }
    return JSON.stringify(data, null, 2);
  };

  const getContextTypes = () => [
    { value: 'fundamentals', label: 'Fundamentals' },
    { value: 'news', label: 'News' },
    { value: 'quote', label: 'Quote' },
    { value: 'yfinance', label: 'Yahoo Finance' },
  ];

  const getSubtypes = (type: string) => {
    if (type === 'yfinance') {
      return [
        { value: 'historical', label: 'Historical' },
        { value: 'quote', label: 'Quote' },
        { value: 'quoteSummary', label: 'Quote Summary' },
        { value: 'search', label: 'Search' },
        { value: 'insights', label: 'Insights' },
        { value: 'options', label: 'Options' },
        { value: 'recommendationsBySymbol', label: 'Recommendations' },
      ];
    }
    return [];
  };

  const getParameterFields = (type: string, subtype?: string) => {
    if (type === 'news') {
      return [{ key: 'count', label: 'Count', type: 'number', default: '10' }];
    }
    if (type === 'quote') {
      return [
        { key: 'interval', label: 'Interval', type: 'select', options: ['1d', '1wk', '1mo'], default: '1d' },
        { key: 'days', label: 'Days', type: 'number', default: '30' },
      ];
    }
    if (type === 'yfinance' && subtype === 'quoteSummary') {
      return [{ key: 'modules', label: 'Modules', type: 'text', default: 'summaryDetail,price' }];
    }
    if (type === 'yfinance' && subtype === 'historical') {
      return [
        { key: 'interval', label: 'Interval', type: 'select', options: ['1d', '1wk', '1mo'], default: '1d' },
        { key: 'days', label: 'Days', type: 'number', default: '30' },
      ];
    }
    if (type === 'yfinance' && subtype === 'search') {
      return [{ key: 'q', label: 'Query', type: 'text', default: '' }];
    }
    return [];
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

            {/* Context Selector */}
            {showContextSelector && (
              <div className="p-4 border-t bg-muted/10">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Select Context</h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowContextSelector(false)}
                    >
                      <X size={14} />
                    </Button>
                  </div>

                  {contextStep === 'type' && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Choose context type:</p>
                      <div className="grid grid-cols-2 gap-2">
                        {getContextTypes().map((type) => (
                          <Button
                            key={type.value}
                            variant="outline"
                            size="sm"
                            onClick={() => handleTypeSelect(type.value)}
                          >
                            {type.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {contextStep === 'subtype' && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Choose subtype:</p>
                      <div className="grid grid-cols-2 gap-2">
                        {getSubtypes(selectedType).map((subtype) => (
                          <Button
                            key={subtype.value}
                            variant="outline"
                            size="sm"
                            onClick={() => handleSubtypeSelect(subtype.value)}
                          >
                            {subtype.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {contextStep === 'stock' && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Select stock:</p>
                      <div className="relative">
                        <Input
                          placeholder="Search stocks..."
                          value={stockSearchQuery}
                          onChange={(e) => setStockSearchQuery(e.target.value)}
                          className="mb-2"
                          autoFocus
                        />
                        <div className="max-h-48 overflow-y-auto border rounded-md bg-background">
                          {contextStocks && contextStocks.length > 0 ? (
                            contextStocks.map((stock) => (
                              <div
                                key={stock.symbol}
                                className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                                onClick={() => handleStockSelect(stock.symbol)}
                              >
                                <div className="font-medium">{stock.symbol}</div>
                                <div className="text-sm text-muted-foreground">{stock.name}</div>
                              </div>
                            ))
                          ) : (
                            <div className="p-2 text-sm text-muted-foreground">
                              {stockSearchQuery ? 'No stocks found' : 'Start typing to search stocks...'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {contextStep === 'parameters' && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Configure parameters:</p>
                      {getParameterFields(selectedType, selectedSubtype).map((field) => (
                        <div key={field.key}>
                          <label className="text-xs font-medium">{field.label}</label>
                          {field.type === 'select' ? (
                            <Select
                              value={contextParameters[field.key] || field.default}
                              onValueChange={(value) => handleParameterChange(field.key, value)}
                            >
                              <SelectTrigger className="mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {field.options?.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type={field.type}
                              value={contextParameters[field.key] || field.default}
                              onChange={(e) => handleParameterChange(field.key, e.target.value)}
                              className="mt-1"
                            />
                          )}
                        </div>
                      ))}
                      <Button onClick={handleContextComplete} className="w-full">
                        Add Context
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

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
                  ref={inputRef}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  className="flex-1"
                  disabled={sendMessage.isPending || isGenerating}
                />

                <Button
                  onClick={handleContextButtonClick}
                  variant="outline"
                  size="sm"
                  disabled={sendMessage.isPending || isGenerating}
                >
                  <Database className="w-4 h-4" />
                </Button>

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
