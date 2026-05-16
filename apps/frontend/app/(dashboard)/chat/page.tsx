'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AgenticChat, AgenticChatConfig } from '@/components/chat/agentic-chat';
import { AGENT_SUMMARIES } from '@/agents/client-config';

const chatConfig: AgenticChatConfig = {
  availableAgents: AGENT_SUMMARIES,
  defaultAgentId: 'assistant',
  allowFileUpload: true,
  showArtifacts: true,
  showReasoning: true,
  basePath: '/chat',
  className: 'h-full',
};

function ChatPageInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? undefined;
  return (
    <div className="h-full">
      <AgenticChat config={chatConfig} initialChatId={id} />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="h-full" />}>
      <ChatPageInner />
    </Suspense>
  );
}
