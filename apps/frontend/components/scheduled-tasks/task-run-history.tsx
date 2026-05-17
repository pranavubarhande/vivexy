'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, CheckCircle2, XCircle, Loader2, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { scheduledTasksService } from '@/services/scheduled-tasks.service';
import type {
  ScheduledTask,
  ScheduledTaskRun,
  RunStatus,
} from '@/types/scheduled-task';

interface Props {
  task: ScheduledTask | null;
  onClose: () => void;
}

function StatusIcon({ status }: { status: RunStatus }) {
  if (status === 'completed')
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'failed')
    return <XCircle className="h-4 w-4 text-destructive" />;
  return <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />;
}

function StatusBadge({ status }: { status: RunStatus }) {
  if (status === 'completed')
    return (
      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
        Completed
      </Badge>
    );
  if (status === 'failed')
    return (
      <Badge
        variant="destructive"
        className="bg-destructive/10 text-destructive border-destructive/20"
      >
        Failed
      </Badge>
    );
  return <Badge variant="secondary">Running</Badge>;
}

function duration(run: ScheduledTaskRun): string {
  if (!run.completedAt) return '—';
  const ms =
    new Date(run.completedAt).getTime() - new Date(run.ranAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

const POLL_INTERVAL = 3000;

export function TaskRunHistory({ task, onClose }: Props) {
  const [runs, setRuns] = useState<ScheduledTaskRun[]>([]);
  const [loading, setLoading] = useState(false);

  const hasRunning = runs.some((r) => r.status === 'running');

  const fetchRuns = (taskId: string, showLoading = false) => {
    if (showLoading) setLoading(true);
    scheduledTasksService
      .getRuns(taskId)
      .then(setRuns)
      .catch(() => toast.error('Failed to load run history'))
      .finally(() => showLoading && setLoading(false));
  };

  // Initial load
  useEffect(() => {
    if (!task) {
      setRuns([]);
      return;
    }
    fetchRuns(task.id, true);
  }, [task]);

  // Poll while any run is in progress
  useEffect(() => {
    if (!task || !hasRunning) return;
    const id = setInterval(() => fetchRuns(task.id), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [task, hasRunning]);

  const chatUrl = (chatId: string) => `/chat?id=${chatId}`;

  return (
    <Sheet open={!!task} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="truncate pr-4">
              {task?.name} — Run History
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="mt-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && runs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              No runs yet. Trigger the task manually or wait for the next
              scheduled run.
            </p>
          )}

          {!loading && runs.length > 0 && (
            <div className="space-y-3">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="rounded-lg border border-border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={run.status} />
                      <StatusBadge status={run.status} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(run.ranAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Duration: {duration(run)}</span>
                    {run.chatId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-6 text-xs gap-1 px-2"
                      >
                        <a
                          href={chatUrl(run.chatId)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View chat
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                  </div>

                  {run.error && (
                    <p className="text-xs text-destructive bg-destructive/5 rounded px-2 py-1 break-words">
                      {run.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
