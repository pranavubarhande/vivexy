'use client';

import { ChatMessage } from '@/components/chat/chat-message';
import { CheckpointMarker } from '@/components/chat/checkpoint-marker';
import { Skeleton } from '@/components/ui/skeleton';
import type { Message } from '@/services/chat.service';

interface ChatMessageListProps {
  messages: Message[];
  showReasoning: boolean;
  isLoading?: boolean;
  onRevert: (messageId: string, content: string) => void;
  checkpoints?: Array<{
    id: string;
    label: string;
    createdAt: string;
    messageId: string;
  }>;
  onRestoreCheckpoint?: (checkpointId: string) => void;
  isRestoringCheckpoint?: boolean;
}

function ChatMessageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Assistant skeleton */}
      <div className="flex flex-col w-full space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      {/* User skeleton */}
      <div className="flex justify-end pl-4">
        <div className="space-y-2 max-w-[85%] w-full flex flex-col items-end">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      {/* Assistant skeleton */}
      <div className="flex flex-col w-full space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

export const ChatMessageList = ({
  messages,
  showReasoning,
  isLoading = false,
  onRevert,
  checkpoints,
  onRestoreCheckpoint,
  isRestoringCheckpoint,
}: ChatMessageListProps) => {
  if (isLoading) return <ChatMessageSkeleton />;
  if (messages.length === 0) return null;

  const checkpointByMessageId = new Map(
    (checkpoints ?? []).map((cp) => [cp.messageId, cp])
  );

  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          <ChatMessage
            message={message}
            showReasoning={showReasoning}
            onRevert={onRevert}
          />
          {message.role === 'user' && checkpointByMessageId.has(message.id) && (
            <CheckpointMarker
              checkpoint={checkpointByMessageId.get(message.id)!}
              onRestore={onRestoreCheckpoint ?? (() => {})}
              isRestoring={isRestoringCheckpoint}
            />
          )}
        </div>
      ))}
      <div className="h-4" />
    </>
  );
};
