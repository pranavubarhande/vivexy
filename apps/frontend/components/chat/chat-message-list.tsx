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
  if (messages.length === 0) {
    return (
      <div className="h-full min-h-[40vh] flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in zoom-in-95 duration-500">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-2 shadow-sm">
          <span className="text-3xl">{agent?.icon}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {agent?.name
            ? `How can ${agent.name} help?`
            : 'How can I help today?'}
        </h1>
        <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
          I&apos;m your agentic portfolio assistant. I can analyze stocks,
          manage documents, and help with your financial goals.
        </p>
      </div>
    );
  }

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
