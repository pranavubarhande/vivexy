export interface AgentSummary {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export const AGENT_SUMMARIES: AgentSummary[] = [
  {
    id: 'general',
    name: 'General Assistant',
    description:
      'A helpful AI assistant for general tasks, document analysis, and conversation.',
    icon: '🤖',
    color: '#6366f1', // Indigo
  },
  {
    id: 'finance',
    name: 'Finance Agent',
    description:
      'Specialized agent for stock analysis, financial data, and market insights.',
    icon: '📊',
    color: '#10b981', // Emerald
  },
  {
    id: 'document',
    name: 'Document Agent',
    description:
      'Expert at analyzing documents, generating reports, and managing files.',
    icon: '📄',
    color: '#f59e0b', // Amber
  },
];
