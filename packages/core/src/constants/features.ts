// Mirrors agents_core/constants/features.py. Every feature is on unless a
// team turns it off; a user loses it if any of their teams turned it off.
export const FEATURES = {
  scheduledTasks: 'scheduled-tasks',
  deployedAgents: 'deployed-agents',
  apiKeys: 'api-keys',
  connectors: 'connectors',
  github: 'github',
  rag: 'rag',
} as const;

export type FeatureName = (typeof FEATURES)[keyof typeof FEATURES];

export const FEATURE_LABELS: Record<FeatureName, string> = {
  'scheduled-tasks': 'Scheduled tasks',
  'deployed-agents': 'Deployed agents',
  'api-keys': 'Bring-your-own provider API keys',
  connectors: 'Third-party connectors',
  github: 'GitHub integration',
  rag: 'Document search (RAG)',
};
