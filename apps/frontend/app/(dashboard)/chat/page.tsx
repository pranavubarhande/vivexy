'use client';

import { Suspense } from 'react';
import { AgenticChat, AgenticChatConfig } from '@/components/chat/agentic-chat';
import { AGENT_SUMMARIES } from '@/agents/client-config';

const chatConfig: AgenticChatConfig = {
  availableAgents: AGENT_SUMMARIES,
  defaultAgentId: 'assistant',
  allowFileUpload: true,
  showArtifacts: true,
  showTodos: true,
  showReasoning: true,
  basePath: '/chat',
  className: 'h-full',
};

function ChatContent() {
  return <AgenticChat config={chatConfig} />;
}

export default function ChatPage() {
  return (
    <div className="h-full">
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            <div className="animate-pulse text-muted-foreground">
              Loading chat...
            </div>
          </div>
        }
      >
        <ChatContent />
      </Suspense>
    </div>
  );
}
