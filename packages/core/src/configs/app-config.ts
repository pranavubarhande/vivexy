import {
  BookMarked,
  Blocks,
  CalendarClock,
  Coins,
  MessageSquare,
  Settings,
  Table2,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { CATALOGUE_AGENTS } from '@vivexy/core/agents/catalogue';
import { AGENT_SUMMARIES } from '@vivexy/core/agents/client-config';
import { FEATURES, type FeatureName } from '@vivexy/core/constants/features';
import {
  AUTH_ROUTES,
  PUBLIC_ROUTES,
  ROUTES,
} from '@vivexy/core/constants/routes';
import type { AgentSummary, CatalogueAgent } from '@vivexy/core/types/agent';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  // Hidden when every listed feature is turned off for the user
  features?: FeatureName[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface AgentCategoryConfig {
  name: string;
  color: string;
}

/**
 * Everything a product built on Vivexy (e.g. Vivexy Legal) can rebrand or
 * extend in the shared UI. Products pass a partial config to
 * AppConfigProvider; anything left out keeps Vivexy's default.
 */
export interface AppConfig {
  appName: string;
  logoSrc: string;
  homePath: string;
  auth: {
    badge: string;
    headline: string;
    highlights: string[];
  };
  navGroups: NavGroup[];
  chat: {
    /** The GitHub repositories button and panel in chat. */
    showGithub: boolean;
  };
  agents: {
    base: AgentSummary[];
    catalogue: CatalogueAgent[];
    categories: AgentCategoryConfig[];
    defaultAgentId: string;
  };
  publicRoutes: string[];
  authRoutes: string[];
}

export const DEFAULT_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Chat', href: ROUTES.chat(), icon: MessageSquare },
      {
        label: 'Document Analyses',
        href: ROUTES.analyses,
        icon: Table2,
        features: [FEATURES.rag],
      },
      {
        label: 'Workflows',
        href: ROUTES.workflows,
        icon: Workflow,
        features: [FEATURES.rag],
      },
      { label: 'Prompt Library', href: ROUTES.prompts, icon: BookMarked },
      {
        label: 'Scheduled Tasks',
        href: ROUTES.scheduledTasks,
        icon: CalendarClock,
        features: [FEATURES.scheduledTasks],
      },
      {
        label: 'Integrations',
        href: ROUTES.connectors,
        icon: Blocks,
        features: [FEATURES.connectors, FEATURES.github],
      },
    ],
  },
  {
    label: 'Organization',
    items: [
      { label: 'Teams', href: ROUTES.teams, icon: Users },
      { label: 'Cost Manager', href: ROUTES.costManager, icon: Coins },
      { label: 'Settings', href: ROUTES.settings, icon: Settings },
    ],
  },
];

export const DEFAULT_AGENT_CATEGORIES: AgentCategoryConfig[] = [
  { name: 'Finance', color: '#6366f1' },
  { name: 'Legal', color: '#0891b2' },
  { name: 'Compliance', color: '#dc2626' },
  { name: 'Cross-functional', color: '#059669' },
];

export const DEFAULT_APP_CONFIG: AppConfig = {
  appName: 'Vivexy',
  logoSrc: '/logo.png',
  homePath: ROUTES.chat(),
  auth: {
    badge: 'Built for legal, finance & compliance',
    headline: 'AI Workspaces for Professional Teams',
    highlights: [
      'Agents that work across your documents and tools',
      'Scheduled automations with full chat history',
      'Bring your own model keys, track every token',
    ],
  },
  navGroups: DEFAULT_NAV_GROUPS,
  chat: { showGithub: true },
  agents: {
    base: AGENT_SUMMARIES,
    catalogue: CATALOGUE_AGENTS,
    categories: DEFAULT_AGENT_CATEGORIES,
    defaultAgentId: AGENT_SUMMARIES[0].id,
  },
  publicRoutes: PUBLIC_ROUTES,
  authRoutes: AUTH_ROUTES,
};

export type AppConfigOverrides = Partial<
  Omit<AppConfig, 'auth' | 'agents' | 'chat'>
> & {
  auth?: Partial<AppConfig['auth']>;
  chat?: Partial<AppConfig['chat']>;
  agents?: Partial<AppConfig['agents']>;
};

export const resolveAppConfig = (
  overrides: AppConfigOverrides = {}
): AppConfig => ({
  ...DEFAULT_APP_CONFIG,
  ...overrides,
  auth: { ...DEFAULT_APP_CONFIG.auth, ...overrides.auth },
  chat: { ...DEFAULT_APP_CONFIG.chat, ...overrides.chat },
  agents: { ...DEFAULT_APP_CONFIG.agents, ...overrides.agents },
});
