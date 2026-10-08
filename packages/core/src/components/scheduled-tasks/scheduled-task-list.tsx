'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Play,
  Pencil,
  Trash2,
  Clock,
  ChevronRight,
  Plus,
  CalendarClock,
} from 'lucide-react';
import { Button } from '@vivexy/ui/button';
import { Switch } from '@vivexy/ui/switch';
import { Badge } from '@vivexy/ui/badge';
import { EmptyState } from '@vivexy/ui/page-header';
import { scheduledTasksService } from '@vivexy/core/services/scheduled-tasks.service';
import type { ScheduledTask } from '@vivexy/core/types/scheduled-task';

interface Props {
  tasks: ScheduledTask[];
  onRefresh: () => void;
  onEdit: (task: ScheduledTask) => void;
  onViewRuns: (task: ScheduledTask) => void;
  onNew: () => void;
}

/** UTC HH:MM → local HH:MM */
function utcToLocal(hhmm: string): string {
  if (!hhmm || !hhmm.includes(':')) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  const offset = new Date().getTimezoneOffset();
  const local = (((h * 60 + m - offset) % 1440) + 1440) % 1440;
  return `${String(Math.floor(local / 60)).padStart(2, '0')}:${String(local % 60).padStart(2, '0')}`;
}

function scheduleLabel(task: ScheduledTask): string {
  switch (task.scheduleType) {
    case 'once':
      return task.scheduledAt
        ? `Once — ${new Date(task.scheduledAt).toLocaleString()}`
        : 'Once (unscheduled)';
    case 'daily': {
      const utc = task.runTime ?? '?';
      const local = task.runTime ? utcToLocal(task.runTime) : '?';
      return `Daily at ${local} (${utc} UTC)`;
    }
    case 'weekly': {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const names = (task.runDays ?? []).map((d) => days[d]).join(', ');
      const utc = task.runTime ?? '?';
      const local = task.runTime ? utcToLocal(task.runTime) : '?';
      return `Weekly — ${names} at ${local} (${utc} UTC)`;
    }
    case 'cron':
      return `Cron: ${task.cronExpression ?? '?'}`;
    default:
      return task.scheduleType;
  }
}

function nextRunLabel(task: ScheduledTask): string {
  if (!task.nextRunAt) return '—';
  const d = new Date(task.nextRunAt);
  const diff = d.getTime() - Date.now();
  if (diff < 0) return 'Overdue';
  if (diff < 60_000) return 'in < 1 min';
  if (diff < 3_600_000) return `in ${Math.round(diff / 60_000)}m`;
  if (diff < 86_400_000) return `in ${Math.round(diff / 3_600_000)}h`;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ScheduledTaskList({
  tasks,
  onRefresh,
  onEdit,
  onViewRuns,
  onNew,
}: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleToggleActive = async (task: ScheduledTask) => {
    try {
      await scheduledTasksService.update(task.id, { isActive: !task.isActive });
      onRefresh();
    } catch {
      toast.error('Failed to update task');
    }
  };

  const handleRunNow = async (task: ScheduledTask) => {
    setLoadingId(task.id);
    try {
      await scheduledTasksService.runNow(task.id);
      toast.success('Task triggered — check Chat history for results');
      onRefresh();
    } catch {
      toast.error('Failed to trigger task');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (task: ScheduledTask) => {
    if (!confirm(`Delete "${task.name}"? This cannot be undone.`)) return;
    try {
      await scheduledTasksService.delete(task.id);
      toast.success('Task deleted');
      onRefresh();
    } catch {
      toast.error('Failed to delete task');
    }
  };

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title="Nothing scheduled yet"
        description="Schedule a chat prompt to run automatically — daily, weekly, or at a specific time. Results land in your chat history."
        action={
          <Button onClick={onNew}>
            <Plus className="h-4 w-4" />
            New scheduled task
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="rounded-2xl border border-border/80 bg-card p-5 flex flex-col sm:flex-row sm:items-start gap-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:shadow-md hover:border-foreground/15 transition-all"
        >
          {/* Active toggle */}
          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            <Switch
              checked={task.isActive}
              onCheckedChange={() => handleToggleActive(task)}
              aria-label="Toggle active"
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{task.name}</span>
              {!task.isActive && (
                <Badge variant="secondary" className="text-xs">
                  Paused
                </Badge>
              )}
              {task.modelName && (
                <Badge variant="outline" className="text-xs font-normal">
                  {task.modelName}
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {task.prompt}
            </p>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {scheduleLabel(task)}
              </span>
              {task.isActive && <span>Next run: {nextRunLabel(task)}</span>}
              {task.lastRunAt && (
                <span>
                  Last run:{' '}
                  {new Date(task.lastRunAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
              {task.fileIds.length > 0 && (
                <span>📎 {task.fileIds.length} file(s)</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Run now"
              disabled={loadingId === task.id}
              onClick={() => handleRunNow(task)}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Edit task"
              onClick={() => onEdit(task)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              title="Delete task"
              onClick={() => handleDelete(task)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="View run history"
              onClick={() => onViewRuns(task)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
