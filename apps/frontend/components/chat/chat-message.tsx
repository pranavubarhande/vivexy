'use client';

import { cn } from '@/utils/common';
import { MessageStream } from './message-stream';
import { ReasoningDisplay } from './reasoning-display';
import { InlineArtifactCard } from './inline-artifact-card';
import { RotateCcw } from 'lucide-react';
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
      <div className="rounded-2xl px-4 py-3 shadow-sm bg-[#f0eee6] dark:bg-muted text-foreground border border-border/50">
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
  agentName?: string;
  agentIcon?: string;
  agentColor?: string;
  showReasoning?: boolean;
}

export function AssistantMessage({
  message,
  agentName,
  agentIcon,
  agentColor,
  showReasoning = true,
}: AssistantMessageProps) {
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold"
          style={{
            backgroundColor: `${agentColor}20`,
            color: agentColor,
          }}
        >
          {agentIcon || '🤖'}
        </div>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {agentName || 'Assistant'}
        </span>
      </div>
      <div className="w-full">
        {showReasoning && message.reasoning && message.reasoning.length > 0 && (
          <ReasoningDisplay steps={message.reasoning} />
        )}
        <MessageStream
          content={message.content}
          role={message.role}
          isStreaming={message.isStreaming}
        />
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Container that picks the right message type
// ---------------------------------------------------------------------------

interface ChatMessageProps {
  message: Message;
  agentName?: string;
  agentIcon?: string;
  agentColor?: string;
  showReasoning?: boolean;
  onRevert?: (messageId: string) => void;
}

export function ChatMessage({
  message,
  agentName,
  agentIcon,
  agentColor,
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
        <AssistantMessage
          message={message}
          agentName={agentName}
          agentIcon={agentIcon}
          agentColor={agentColor}
          showReasoning={showReasoning}
        />
      )}
    </div>
  );
}
