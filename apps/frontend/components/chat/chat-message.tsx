'use client';

import { cn } from '@/utils/common';
import { MessageStream } from './message-stream';
import { ReasoningDisplay, StepItem } from './reasoning-display';
import { InlineArtifactCard } from './inline-artifact-card';
import { InlineTodoList } from './inline-todo-list';
import React from 'react';
import { RotateCcw, Copy, Check } from 'lucide-react';
import { Message, Artifact } from '@/services/chat.service';

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

function formatTime(iso: string) {
  const dateString = iso.endsWith('Z') ? iso : `${iso}Z`;
  return new Date(dateString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// User message
// ---------------------------------------------------------------------------

interface UserMessageProps {
  message: Message;
  onRevert?: (messageId: string) => void;
}

export function UserMessage({ message, onRevert }: UserMessageProps) {
  return (
    <div className="space-y-2 items-end flex flex-col max-w-[85%]">
      <div className="rounded-2xl px-4 py-3 shadow-sm bg-muted text-foreground border border-border/40">
        <MessageStream
          content={message.content}
          role={message.role}
          isStreaming={message.isStreaming}
        />
      </div>
      <div className="flex items-center gap-2 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] text-muted-foreground">
          {formatTime(message.createdAt)}
        </span>
        {!message.id.startsWith('temp-') && onRevert && (
          <button
            onClick={() => onRevert(message.id)}
            title="Revert to this message"
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw size={11} />
            Revert
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Assistant message
// ---------------------------------------------------------------------------

interface AssistantMessageProps {
  message: Message;
  showReasoning?: boolean;
}

export function AssistantMessage({
  message,
  showReasoning = true,
}: AssistantMessageProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full space-y-2 group">
      <div className="w-full">
        {message.todos && message.todos.length > 0 && (
          <InlineTodoList todos={message.todos} />
        )}
        {showReasoning && message.timeline && message.timeline.length > 0 ? (
          // Interleaved: render steps and content chunks in arrival order
          <>
            {message.timeline.map((item, i) => {
              if (item.type === 'step') {
                return (
                  <StepItem
                    key={i}
                    step={item.step}
                    isStreaming={message.isStreaming}
                  />
                );
              }
              return (
                <MessageStream
                  key={i}
                  content={item.text}
                  role={message.role}
                  isStreaming={
                    message.isStreaming && i === message.timeline!.length - 1
                  }
                />
              );
            })}
          </>
        ) : (
          // Fallback: legacy layout (saved messages without timeline)
          <>
            {showReasoning &&
              message.reasoning &&
              message.reasoning.length > 0 && (
                <ReasoningDisplay
                  steps={message.reasoning}
                  defaultCollapsed={!message.isStreaming}
                />
              )}
            <MessageStream
              content={message.content}
              role={message.role}
              isStreaming={message.isStreaming}
            />
          </>
        )}
        {message.artifacts && message.artifacts.length > 0 && (
          <div className="mt-3 space-y-3">
            {message.artifacts.map((art: Artifact) => (
              <InlineArtifactCard key={art.id} artifact={art} />
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] text-muted-foreground">
          {formatTime(message.createdAt)}
        </span>
        <button
          onClick={handleCopy}
          title="Copy message"
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Container that picks the right message type
// ---------------------------------------------------------------------------

interface ChatMessageProps {
  message: Message;
  showReasoning?: boolean;
  onRevert?: (messageId: string) => void;
}

export function ChatMessage({
  message,
  showReasoning,
  onRevert,
}: ChatMessageProps) {
  return (
    <div
      className={cn(
        'group animate-in fade-in slide-in-from-bottom-2 duration-300',
        message.role === 'user'
          ? 'flex justify-end pl-4'
          : 'flex flex-col w-full'
      )}
    >
      {message.role === 'user' ? (
        <UserMessage message={message} onRevert={onRevert} />
      ) : (
        <AssistantMessage message={message} showReasoning={showReasoning} />
      )}
    </div>
  );
}
