import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatHeader } from '../chat-header';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  Plus: () => <div data-testid="icon-plus" />,
  Share2: () => <div data-testid="icon-share2" />,
}));

vi.mock('../../shared/app-shell', () => ({
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
    render(<ChatHeader {...defaultProps} />);
    expect(screen.getByTestId('mobile-sidebar-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('chat-history-dropdown')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
  });

  it('should show Generating... status when streaming', () => {
    render(<ChatHeader {...defaultProps} isStreaming={true} />);
    expect(screen.getByText('Generating…')).toBeInTheDocument();
  });

  it('should disable share button when no chatId', () => {
    render(<ChatHeader {...defaultProps} chatId={null} />);
    const shareButton = screen.getByRole('button', { name: /share/i });
    expect(shareButton).toBeDisabled();
  });

  it('should enable share button when chatId is provided', () => {
    render(<ChatHeader {...defaultProps} chatId="123" />);
    const shareButton = screen.getByRole('button', { name: /share/i });
    expect(shareButton).not.toBeDisabled();
  });

  it('should call onNewChat when new chat button is clicked', () => {
    render(<ChatHeader {...defaultProps} />);
    const newChatButton = screen.getByRole('button', { name: /new chat/i });
    newChatButton.click();
    expect(defaultProps.onNewChat).toHaveBeenCalled();
  });
});
