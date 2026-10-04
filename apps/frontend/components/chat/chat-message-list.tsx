'use client';

import { ChatMessage } from '@/components/chat/chat-message';
import { Skeleton } from '@vivexy/ui/skeleton';
import type { Message } from '@/services/chat.service';

interface ChatMessageListProps {
  messages: Message[];
  showReasoning: boolean;
  isLoading?: boolean;
  onRevert: (messageId: string, content: string) => void;
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
}: ChatMessageListProps) => {
  if (isLoading) return <ChatMessageSkeleton />;
  if (messages.length === 0) return null;

  return (
    <>
      {messages.map((message) => (
        <div key={message.id}>
          <ChatMessage
            message={message}
            showReasoning={showReasoning}
            onRevert={onRevert}
          />
        </div>
      ))}
      <div className="h-4" />
    </>
  );
};
