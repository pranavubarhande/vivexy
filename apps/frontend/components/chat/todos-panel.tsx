'use client';

import { useState } from 'react';
import { cn } from '@/utils/common';

interface Todo {
  id: string;
  title: string;
  description: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  dueDate: string | null;
}

interface TodosPanelProps {
  todos: Todo[];
  className?: string;
  onStatusChange?: (todoId: string, status: Todo['status']) => void;
}

const PRIORITY_COLORS: Record<Todo['priority'], string> = {
  LOW: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  MEDIUM: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  HIGH: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  URGENT: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

const STATUS_ICONS: Record<Todo['status'], string> = {
  PENDING: '○',
  IN_PROGRESS: '◐',
  COMPLETED: '✓',
  CANCELLED: '✗',
};

export function TodosPanel({
  todos,
  className,
  onStatusChange,
}: TodosPanelProps) {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const filteredTodos = todos.filter((todo) => {
    if (filter === 'active') {
      return todo.status === 'PENDING' || todo.status === 'IN_PROGRESS';
    }
    if (filter === 'completed') {
      return todo.status === 'COMPLETED' || todo.status === 'CANCELLED';
    }
    return true;
  });

  const handleToggle = (todo: Todo) => {
    if (!onStatusChange) return;

    const nextStatus: Todo['status'] =
      todo.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    onStatusChange(todo.id, nextStatus);
  };

  if (todos.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-6 text-center text-muted-foreground',
          className
        )}
      >
        <span className="text-4xl mb-2">✅</span>
        <p className="text-sm">No tasks yet</p>
        <p className="text-xs mt-1">
          Ask the agent to create tasks for tracking
        </p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil(
      (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays < 0) return 'Overdue';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `In ${diffDays} days`;
    return date.toLocaleDateString();
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Filter tabs */}
      <div className="flex gap-1 p-2 border-b">
        {(['all', 'active', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm capitalize transition-colors',
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Todo list */}
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {filteredTodos.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-4">
            No {filter} tasks
          </p>
        ) : (
          filteredTodos.map((todo) => (
            <div
              key={todo.id}
              className={cn(
                'p-3 rounded-lg border transition-all',
                todo.status === 'COMPLETED' && 'opacity-60',
                todo.status === 'CANCELLED' && 'opacity-40'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Status toggle */}
                <button
                  onClick={() => handleToggle(todo)}
                  className={cn(
                    'mt-0.5 w-5 h-5 rounded border flex items-center justify-center text-xs transition-colors',
                    todo.status === 'COMPLETED'
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-muted-foreground/30 hover:border-primary'
                  )}
                >
                  {STATUS_ICONS[todo.status]}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        'font-medium',
                        todo.status === 'COMPLETED' && 'line-through'
                      )}
                    >
                      {todo.title}
                    </span>
                    <span
                      className={cn(
                        'text-xs px-1.5 py-0.5 rounded',
                        PRIORITY_COLORS[todo.priority]
                      )}
                    >
                      {todo.priority}
                    </span>
                  </div>

                  {todo.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {todo.description}
                    </p>
                  )}

                  {todo.dueDate && (
                    <p
                      className={cn(
                        'text-xs mt-1',
                        new Date(todo.dueDate) < new Date()
                          ? 'text-red-500'
                          : 'text-muted-foreground'
                      )}
                    >
                      📅 {formatDate(todo.dueDate)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Stats footer */}
      <div className="p-2 border-t text-xs text-muted-foreground text-center">
        {todos.filter((t) => t.status === 'COMPLETED').length} of {todos.length}{' '}
        completed
      </div>
    </div>
  );
}

// Compact todo notification for inline display
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
        PRIORITY_COLORS[priority]
      )}
    >
      <span>☑️</span>
      <span className="font-medium">{title}</span>
      <span className="text-xs opacity-70">Created →</span>
    </button>
  );
}
