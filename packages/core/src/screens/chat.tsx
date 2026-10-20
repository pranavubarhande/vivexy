'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AgenticChat } from '@vivexy/core/chat/agentic-chat';
import { useDeployedAgentSummaries } from '@vivexy/core/hooks/useAgents';
import { useAppConfig } from '@vivexy/core/shared/app-config-provider';

function ChatPageInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? undefined;
  const agents = useDeployedAgentSummaries();
  const { agents: agentConfig } = useAppConfig();

  return (
    <div className="h-full">
      <AgenticChat
        config={{
          availableAgents: agents,
          defaultAgentId: agentConfig.defaultAgentId,
          allowFileUpload: true,
          showArtifacts: true,
          showReasoning: true,
          basePath: '/chat',
          className: 'h-full',
        }}
        initialChatId={id}
      />
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
