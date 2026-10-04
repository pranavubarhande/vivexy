import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { ChatHeader } from '../chat-header';

// ChatHeader renders chat-history-dropdown, which calls useProjects() (react-query) —
// needs a QueryClientProvider ancestor or the render throws.
function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

// Mock Lucide icons. Keep every real icon (shared ui components like Dialog/
// Select pull in icons of their own, transitively, beyond what chat-header.tsx
// imports directly) and only stub the two this test suite actually asserts on.
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return {
    ...actual,
    Plus: () => <div data-testid="icon-plus" />,
    Share2: () => <div data-testid="icon-share2" />,
  };
});

vi.mock('@vivexy/core/shared/app-shell', () => ({
  MobileSidebarTrigger: () => <div data-testid="mobile-sidebar-trigger" />,
}));

vi.mock('@/components/chat/chat-history-dropdown', () => ({
  ChatHistoryDropdown: () => <div data-testid="chat-history-dropdown" />,
}));

describe('ChatHeader Component', () => {
  const defaultProps = {
    chats: [],
    chatId: null,
    isStreaming: false,
    onChatSelect: vi.fn(),
    onChatDelete: vi.fn(),
    onNewChat: vi.fn(),
    selectedProjectId: null,
    onProjectChange: vi.fn(),
  };

  it('should render correctly', () => {
    renderWithQueryClient(<ChatHeader {...defaultProps} />);
    expect(screen.getByTestId('mobile-sidebar-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('chat-history-dropdown')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
  });

  it('should show Generating... status when streaming', () => {
    renderWithQueryClient(<ChatHeader {...defaultProps} isStreaming={true} />);
    expect(screen.getByText('Generating…')).toBeInTheDocument();
  });

  // There's no standalone "Share" button in the current component — sharing
  // lives inside the three-dot ChatOptionsMenu (an icon-only, unlabeled
  // DropdownMenuTrigger), which itself only renders once a chat exists
  // ({chatId && <ChatOptionsMenu .../>} in chat-header.tsx). So "no chatId"
  // means the whole menu trigger is absent, not present-but-disabled.
  it('should render exactly one extra button (the chat options menu trigger) once chatId is set', () => {
    const withoutChat = renderWithQueryClient(
      <ChatHeader {...defaultProps} chatId={null} />
    );
    const baselineButtonCount = screen.getAllByRole('button').length;
    withoutChat.unmount();

    renderWithQueryClient(<ChatHeader {...defaultProps} chatId="123" />);
    // The three-dot ChatOptionsMenu trigger is unlabeled (no aria-label/title),
    // so it can't be queried by accessible name — assert on the count delta
    // instead: exactly one more button than the no-chat baseline.
    expect(screen.getAllByRole('button')).toHaveLength(baselineButtonCount + 1);
  });

  it('should call onNewChat when new chat button is clicked', () => {
    renderWithQueryClient(<ChatHeader {...defaultProps} />);
    const newChatButton = screen.getByRole('button', { name: /new chat/i });
    newChatButton.click();
    expect(defaultProps.onNewChat).toHaveBeenCalled();
  });
});
