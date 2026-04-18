'use client';

import { Chat } from '@/services/chat.service';
import { cn } from '@/utils/common';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { MessageSquare, Trash2, ChevronDown } from 'lucide-react';

interface ChatHistoryDropdownProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelect: (chatId: string) => void;
  onDelete: (chatId: string) => void;
  className?: string;
}

export function ChatHistoryDropdown({
  chats,
  activeChatId,
  onSelect,
  onDelete,
  className,
}: ChatHistoryDropdownProps) {
  const activeChat = chats.find((c) => c.id === activeChatId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-2 h-9', className)}
        >
          <MessageSquare size={16} />
          <span className="max-w-[120px] sm:max-w-[200px] truncate">
            {activeChat?.title || 'History'}
          </span>
          <ChevronDown size={14} className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-2">
          <MessageSquare size={14} />
          Recent Conversations
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[400px] overflow-y-auto py-1">
          {chats.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No chats yet
            </div>
          ) : (
            chats.map((chat) => (
              <DropdownMenuItem
                key={chat.id}
                className={cn(
                  'group flex items-center justify-between cursor-pointer px-3 py-2 mx-1 rounded-md',
                  activeChatId === chat.id
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted'
                )}
                onClick={() => onSelect(chat.id)}
              >
                <div className="flex-1 min-w-0 mr-2">
                  <p className="text-sm font-medium truncate">
                    {chat.title || 'Untitled Chat'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(
                      new Date(
                        chat.createdAt.endsWith('Z')
                          ? chat.createdAt
                          : `${chat.createdAt}Z`
                      ),
                      {
                        addSuffix: true,
                      }
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(chat.id);
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
