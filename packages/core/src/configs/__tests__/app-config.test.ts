import { describe, expect, it } from 'vitest';
import { Scale } from 'lucide-react';
import {
  DEFAULT_APP_CONFIG,
  DEFAULT_NAV_GROUPS,
  resolveAppConfig,
} from '@vivexy/core/configs/app-config';

describe('resolveAppConfig', () => {
  it('returns Vivexy defaults when nothing is overridden', () => {
    expect(resolveAppConfig()).toEqual(DEFAULT_APP_CONFIG);
  });

  it('merges nested auth and agents overrides with the defaults', () => {
    const legalAgent = {
      id: 'legal-assistant',
      name: 'Legal Assistant',
      description: 'Drafts and reviews contracts.',
      icon: Scale,
      color: '#0ea5e9',
    };
    const config = resolveAppConfig({
      appName: 'Vivexy Legal',
      auth: { headline: 'AI for legal teams' },
      agents: {
        base: [legalAgent],
        catalogue: [],
        defaultAgentId: 'legal-assistant',
      },
      navGroups: [
        ...DEFAULT_NAV_GROUPS,
        {
          label: 'Legal',
          items: [{ label: 'Clause Library', href: '/clauses', icon: Scale }],
        },
      ],
    });

    expect(config.appName).toBe('Vivexy Legal');
    expect(config.auth.headline).toBe('AI for legal teams');
    expect(config.auth.highlights).toEqual(DEFAULT_APP_CONFIG.auth.highlights);
    expect(config.agents.base).toEqual([legalAgent]);
    expect(config.agents.categories).toEqual(
      DEFAULT_APP_CONFIG.agents.categories
    );
    expect(config.navGroups.at(-1)?.label).toBe('Legal');
    expect(config.logoSrc).toBe(DEFAULT_APP_CONFIG.logoSrc);
  });
});
