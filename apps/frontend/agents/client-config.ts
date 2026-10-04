export type { AgentSummary } from '@vivexy/core/types/agent';
import type { AgentSummary } from '@vivexy/core/types/agent';
import { Bot } from 'lucide-react';

/** Base agents always available in chat regardless of deployed catalogue agents. */
export const AGENT_SUMMARIES: AgentSummary[] = [
  {
    id: 'assistant',
    name: 'Portfolio Assistant',
    description:
      'Your AI assistant for portfolio tasks: stocks, documents, tasks, and files.',
    icon: Bot,
    color: '#6366f1',
  },
];
