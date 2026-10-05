import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerifyEmailBanner } from '../verify-email-banner';

const mockUseAuthSafe = vi.fn();
vi.mock('../auth-provider', () => ({
  useAuthSafe: () => mockUseAuthSafe(),
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('VerifyEmailBanner', () => {
  beforeEach(() => {
    mockUseAuthSafe.mockReset();
  });

  it('renders nothing when not authenticated', () => {
    mockUseAuthSafe.mockReturnValue({
      user: null,
      isAuthenticated: false,
    });

    const { container } = renderWithQueryClient(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the user is already verified', () => {
    mockUseAuthSafe.mockReturnValue({
      user: { emailVerified: true },
      isAuthenticated: true,
    });

    const { container } = renderWithQueryClient(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the reminder banner when the user is unverified', () => {
    mockUseAuthSafe.mockReturnValue({
      user: { emailVerified: false },
      isAuthenticated: true,
    });

    renderWithQueryClient(<VerifyEmailBanner />);

    expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /resend email/i })
    ).toBeInTheDocument();
  });
});
