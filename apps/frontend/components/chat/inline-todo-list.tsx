'use client';

import { cn } from '@/utils/common';
import { Check, Minus, Circle, AlertCircle } from 'lucide-react';
import type { InlineTodo } from '@/services/chat.service';

interface InlineTodoListProps {
  todos: InlineTodo[];
}

const statusConfig: Record<
  string,
  {
    icon: typeof Circle;
    iconClass: string;
    textClass: string;
  }
> = {
  PENDING: {
    icon: Circle,
    iconClass: 'text-muted-foreground/60',
    textClass: 'text-foreground',
  },
  IN_PROGRESS: {
    icon: Minus,
    iconClass: 'text-blue-500',
    textClass: 'text-foreground',
  },
  RUNNING: {
    icon: Minus,
    iconClass: 'text-blue-500',
    textClass: 'text-foreground',
  },
  COMPLETED: {
    icon: Check,
    iconClass: 'text-emerald-500',
    textClass: 'text-muted-foreground line-through',
  },
  DONE: {
    icon: Check,
    iconClass: 'text-emerald-500',
    textClass: 'text-muted-foreground line-through',
  },
  ERROR: {
    icon: AlertCircle,
    iconClass: 'text-red-500',
    textClass: 'text-red-500',
  },
};

export const InlineTodoList = ({ todos }: InlineTodoListProps) => {
  if (!todos.length) return null;

  return (
    <div className="my-3 rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40">
        <span className="text-xs font-semibold text-muted-foreground tracking-wide">
          To-dos
        </span>
        <span className="text-xs text-muted-foreground/70">{todos.length}</span>
      </div>
      <div className="px-2 py-1.5 space-y-0.5">
        {todos.map((todo) => {
          const cfg = statusConfig[todo.status] || statusConfig.PENDING;
          const Icon = cfg.icon;

          return (
            <div
              key={todo.id}
              className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg"
            >
              <div
                className={cn(
                  'mt-0.5 shrink-0 w-4 h-4 flex items-center justify-center rounded-full',
                  (todo.status === 'COMPLETED' || todo.status === 'DONE') &&
                    'bg-emerald-500/15 dark:bg-emerald-500/20',
                  (todo.status === 'IN_PROGRESS' ||
                    todo.status === 'RUNNING') &&
                    'bg-blue-500/15 dark:bg-blue-500/20',
                  todo.status === 'ERROR' && 'bg-red-500/15 dark:bg-red-500/20'
                )}
              >
                <Icon size={11} className={cfg.iconClass} strokeWidth={2.5} />
              </div>
              <span className={cn('text-sm leading-snug', cfg.textClass)}>
                {todo.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
