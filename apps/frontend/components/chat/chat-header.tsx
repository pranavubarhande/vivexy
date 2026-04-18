'use client';

import { cn } from '@/utils/common';
import { Button } from '@/components/ui/button';
import { ChatHistoryDropdown } from '@/components/chat/chat-history-dropdown';
import { MobileSidebarTrigger } from '../shared/app-shell';
import { Plus, Share2 } from 'lucide-react';
import type { Chat } from '@/services/chat.service';
import { toast } from 'sonner';

interface ChatHeaderProps {
  chats: Chat[];
  chatId: string | null;
  isStreaming: boolean;
  basePath?: string;
  onChatSelect: (id: string) => void;
  onChatDelete: (id: string) => void;
  onNewChat: () => void;
}

export const ChatHeader = ({
  chats,
  chatId,
  isStreaming,
  basePath,
  onChatSelect,
  onChatDelete,
  onNewChat,
}: ChatHeaderProps) => {
  const handleShare = async () => {
    if (!chatId) return;
    const url = `${window.location.origin}${basePath || '/chat'}?id=${chatId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Chat link copied to clipboard');
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <header className="h-14 border-b border-border/50 bg-background/95 backdrop-blur-sm flex items-center justify-between px-4 pl-4 sticky top-0 z-10 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <MobileSidebarTrigger />
        <ChatHistoryDropdown
          chats={chats}
          onSelect={onChatSelect}
          onDelete={onChatDelete}
          activeChatId={chatId}
        />
        <button
          onClick={onNewChat}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
          title="New chat"
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex items-center gap-1.5 text-xs font-medium text-muted-foreground',
            isStreaming && 'text-primary'
          )}
        >
          <div
            className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              isStreaming
                ? 'bg-primary animate-pulse'
                : 'bg-muted-foreground/30'
            )}
          />
          <span className="hidden sm:inline">
            {isStreaming ? 'Generating…' : 'Idle'}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleShare}
          disabled={!chatId}
          className="gap-1.5 h-8 text-xs"
        >
          <Share2 size={14} />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>
    </header>
  );
};
