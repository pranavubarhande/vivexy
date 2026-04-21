'use client';

import { ChatMessage } from '@/components/chat/chat-message';
import type { Message } from '@/services/chat.service';

interface ChatMessageListProps {
  messages: Message[];
  showReasoning: boolean;
  onRevert: (messageId: string) => void;
}

export const ChatMessageList = ({
  messages,
  showReasoning,
  onRevert,
}: ChatMessageListProps) => {
  if (messages.length === 0) return null;

  return (
    <>
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          showReasoning={showReasoning}
          onRevert={onRevert}
        />
      ))}
      <div className="h-4" />
    </>
  );
};
