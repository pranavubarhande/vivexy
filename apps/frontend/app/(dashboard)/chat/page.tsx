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

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  return (
    <div className="h-full">
      <AgenticChat config={chatConfig} initialChatId={id} />
    </div>
  );
}
