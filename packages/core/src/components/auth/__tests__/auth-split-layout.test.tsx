import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AuthSplitLayout } from '../auth-split-layout';
import { AppConfigProvider } from '@vivexy/core/shared/app-config-provider';

// This test file is the first in this codebase to render a component
// that uses next/image. There's no existing precedent/mock for it in
// vitest.setup.ts (confirmed: packages/core/vitest.setup.ts only sets up
// jest-dom), and this is a plain Vite/jsdom environment, not Next's own
// test runtime, so next/image's real implementation isn't guaranteed to
// render cleanly here. Mock it to a plain <img> to remove that risk
// entirely rather than find out at test time.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

describe('AuthSplitLayout', () => {
  it('renders children, the app name, and the tagline', () => {
    render(
      <AuthSplitLayout appName="Vivexy">
        <div>Form content</div>
      </AuthSplitLayout>
    );

    expect(screen.getByText('Form content')).toBeInTheDocument();
    // Appears twice: once in the mobile top bar, once in the desktop
    // brand panel -- both render unconditionally, visibility is CSS-only
    // (Tailwind `hidden`/`md:hidden`), so both exist in the DOM in jsdom.
    expect(screen.getAllByText('Vivexy').length).toBe(2);
    expect(
      screen.getByText('AI Workspaces for Professional Teams')
    ).toBeInTheDocument();
  });

  it('uses the product branding from AppConfigProvider', () => {
    render(
      <AppConfigProvider
        config={{
          appName: 'Vivexy Legal',
          logoSrc: '/legal-logo.png',
          auth: {
            headline: 'AI for legal teams',
            highlights: ['Clause library'],
          },
        }}
      >
        <AuthSplitLayout>
          <div>Form content</div>
        </AuthSplitLayout>
      </AppConfigProvider>
    );

    expect(screen.getAllByText('Vivexy Legal').length).toBe(2);
    expect(screen.getByText('AI for legal teams')).toBeInTheDocument();
    expect(screen.getByText('Clause library')).toBeInTheDocument();
    expect(
      screen.getByText('Built for legal, finance & compliance')
    ).toBeInTheDocument();
    expect(screen.getAllByAltText('Vivexy Legal')[0]).toHaveAttribute(
      'src',
      '/legal-logo.png'
    );
  });
});
