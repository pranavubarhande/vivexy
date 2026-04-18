'use client';

import { useState } from 'react';
import { cn } from '@/utils/common';
import {
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  Calendar,
  ListTodo,
} from 'lucide-react';
import { Todo } from '@/services/chat.service';

interface TodosPanelProps {
  todos: Todo[];
  className?: string;
  onStatusChange?: (todoId: string, status: Todo['status']) => void;
}

const PRIORITY_STYLES: Record<Todo['priority'], string> = {
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400',
  MEDIUM: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  HIGH: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  URGENT: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

function StatusIcon({ status }: { status: Todo['status'] }) {
  if (status === 'COMPLETED')
    return <CheckCircle2 size={16} className="text-emerald-500" />;
  if (status === 'IN_PROGRESS')
    return <Loader2 size={16} className="text-primary animate-spin" />;
  if (status === 'CANCELLED')
    return <XCircle size={16} className="text-muted-foreground/50" />;
  return <Circle size={16} className="text-muted-foreground/40" />;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.ceil(
    (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays < 0) return { label: 'Overdue', overdue: true };
  if (diffDays === 0) return { label: 'Today', overdue: false };
  if (diffDays === 1) return { label: 'Tomorrow', overdue: false };
  if (diffDays < 7) return { label: `In ${diffDays} days`, overdue: false };
  return { label: date.toLocaleDateString(), overdue: false };
}

export function TodosPanel({
  todos,
  className,
  onStatusChange,
}: TodosPanelProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const filteredTodos = todos.filter((todo) => {
    if (filter === 'active')
      return todo.status === 'PENDING' || todo.status === 'IN_PROGRESS';
    if (filter === 'completed')
      return todo.status === 'COMPLETED' || todo.status === 'CANCELLED';
    return true;
  });

  const handleToggle = (todo: Todo) => {
    if (!onStatusChange) return;
    const next: Todo['status'] =
      todo.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    onStatusChange(todo.id, next);
  };

  if (todos.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full',
          className
        )}
      >
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
          <ListTodo size={22} className="text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium">No tasks yet</p>
        <p className="text-xs mt-1 text-muted-foreground/70">
          Ask the agent to create tasks for tracking
        </p>
      </div>
    );
  }

  const completedCount = todos.filter((t) => t.status === 'COMPLETED').length;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Filter tabs */}
      <div className="flex gap-1 p-2 border-b shrink-0">
        {(['all', 'active', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
              filter === f
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-auto p-2 space-y-1.5 custom-scrollbar">
        {filteredTodos.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-6">
            No {filter} tasks
          </p>
        ) : (
          filteredTodos.map((todo) => (
            <div
              key={todo.id}
              className={cn(
                'p-3 rounded-xl border transition-all bg-background',
                todo.status === 'COMPLETED' && 'opacity-55',
                todo.status === 'CANCELLED' && 'opacity-35'
              )}
            >
              <div className="flex items-start gap-2.5">
                <button
                  onClick={() => handleToggle(todo)}
                  className="mt-0.5 shrink-0 hover:scale-110 transition-transform"
                  title={
                    todo.status === 'COMPLETED'
                      ? 'Mark pending'
                      : 'Mark complete'
                  }
                >
                  <StatusIcon status={todo.status} />
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'text-sm font-medium leading-tight',
                        todo.status === 'COMPLETED' && 'line-through'
                      )}
                    >
                      {todo.title}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                        PRIORITY_STYLES[todo.priority]
                      )}
                    >
                      {todo.priority}
                    </span>
                  </div>

                  {todo.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {todo.description}
                    </p>
                  )}

                  {todo.dueDate &&
                    (() => {
                      const { label, overdue } = formatDate(todo.dueDate);
                      return (
                        <p
                          className={cn(
                            'flex items-center gap-1 text-[11px] mt-1.5',
                            overdue ? 'text-red-500' : 'text-muted-foreground'
                          )}
                        >
                          <Calendar size={10} />
                          {label}
                        </p>
                      );
                    })()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t flex items-center justify-between text-xs text-muted-foreground shrink-0">
        <span>
          {completedCount} of {todos.length} completed
        </span>
        {completedCount > 0 && (
          <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${(completedCount / todos.length) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Compact notification
export function TodoNotification({
  title,
  priority,
  onClick,
}: {
  title: string;
  priority: Todo['priority'];
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm',
        PRIORITY_STYLES[priority]
      )}
    >
      <ListTodo size={13} />
      <span className="font-medium">{title}</span>
      <span className="text-xs opacity-70">Created →</span>
    </button>
  );
}
