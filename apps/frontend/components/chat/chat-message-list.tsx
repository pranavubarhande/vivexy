'use client';

import { ChatMessage } from '@/components/chat/chat-message';
import type { Message } from '@/services/chat.service';

interface AgentInfo {
  name?: string;
  icon?: string;
  color?: string;
}

interface ChatMessageListProps {
  messages: Message[];
  agent?: AgentInfo;
  showReasoning: boolean;
  onRevert: (messageId: string) => void;
}

export const ChatMessageList = ({
  messages,
  agent,
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
          agentName={agent?.name}
          agentIcon={agent?.icon}
          agentColor={agent?.color}
          showReasoning={showReasoning}
          onRevert={onRevert}
        />
      ))}
      <div className="h-4" />
    </>
  );
};
