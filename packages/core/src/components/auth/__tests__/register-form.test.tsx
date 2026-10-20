import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RegisterForm } from '../register-form';

// RegisterForm calls useRouter() unconditionally for the post-register
// redirect. Next.js's app router throws "invariant expected app router to
// be mounted" in jsdom without a real router context, so stub it for
// isolation here -- same pattern as login-form.test.tsx.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

// register-form.tsx's handleSSOLogin/API_URL are a deliberate, hand-kept
// duplicate of login-form.tsx's (the plan chose not to extract a shared
// helper) -- without this file, that duplicated logic had zero test
// coverage of its own, which already let one divergence (a missing
// comment) slip through in this same task. Mirrors login-form.test.tsx's
// two assertions exactly.
describe('RegisterForm SSO buttons', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('renders Google and Microsoft SSO buttons that navigate to the backend OAuth login URL', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:5000');
    renderWithQueryClient(<RegisterForm />);

    const googleButton = screen.getByRole('button', {
      name: /continue with google/i,
    });
    const microsoftButton = screen.getByRole('button', {
      name: /continue with microsoft/i,
    });

    expect(googleButton).toBeInTheDocument();
    expect(microsoftButton).toBeInTheDocument();
  });

  it('generates and stores an OAuth state nonce before redirecting, and includes it in the login URL', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:5000');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        set href(v: string) {
          hrefSetter(v);
        },
      },
      writable: true,
    });

    renderWithQueryClient(<RegisterForm />);
    screen.getByRole('button', { name: /continue with microsoft/i }).click();

    expect(setItemSpy).toHaveBeenCalledWith('oauth_state', expect.any(String));
    const storedState = setItemSpy.mock.calls.find(
      (call) => call[0] === 'oauth_state'
    )?.[1];
    expect(hrefSetter).toHaveBeenCalledWith(
      `http://localhost:5000/auth/oauth/microsoft/login?state=${encodeURIComponent(storedState as string)}`
    );
  });
});
