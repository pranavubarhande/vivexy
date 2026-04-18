export interface AgentSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

/** Single unified agent used by chat (no agent selection UI). */
export const AGENT_SUMMARIES: AgentSummary[] = [
  {
    id: 'assistant',
    name: 'Portfolio Assistant',
    description:
      'Your AI assistant for portfolio tasks: stocks, documents, tasks, and files.',
    icon: '🤖',
    color: '#6366f1',
  },
];
