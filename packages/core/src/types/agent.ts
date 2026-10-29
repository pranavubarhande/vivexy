import type { LucideIcon } from 'lucide-react';

export type { LucideIcon };

// Categories are product-defined (see AppConfig.agents.categories)
export type AgentCategory = string;

export interface CatalogueAgent {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  category: AgentCategory;
  tools: string[];
  useCases: string[];
  tags: string[];
}

export interface DeployedAgent {
  id: string;
  agentId: string;
  deployedAt: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
}
