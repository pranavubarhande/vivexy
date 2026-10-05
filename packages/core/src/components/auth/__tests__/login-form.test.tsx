import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { LoginForm } from '../login-form';

// LoginForm calls useRouter() unconditionally for the post-login redirect.
// Next.js's app router throws "invariant expected app router to be mounted"
// in jsdom without a real router context, so stub it for isolation here.
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

describe('LoginForm SSO buttons', () => {
  it('renders Google and Microsoft SSO buttons that navigate to the backend OAuth login URL', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:5000');
    renderWithQueryClient(<LoginForm />);

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
    // jsdom doesn't implement window.location navigation; stub the setter
    // this component actually calls so we can assert what it tried to
    // navigate to without jsdom throwing "not implemented".
    const hrefSetter = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, set href(v: string) { hrefSetter(v); } },
      writable: true,
    });

    renderWithQueryClient(<LoginForm />);
    screen.getByRole('button', { name: /continue with google/i }).click();

    expect(setItemSpy).toHaveBeenCalledWith('oauth_state', expect.any(String));
    const storedState = setItemSpy.mock.calls.find(
      (call) => call[0] === 'oauth_state'
    )?.[1];
    expect(hrefSetter).toHaveBeenCalledWith(
      `http://localhost:5000/auth/oauth/google/login?state=${encodeURIComponent(storedState as string)}`
    );
  });
});
