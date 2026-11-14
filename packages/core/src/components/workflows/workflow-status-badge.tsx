'use client';

import { Loader2 } from 'lucide-react';
import { Badge } from '@vivexy/ui/badge';
import type { WorkflowRunStatus } from '../../types/workflow';

const STATUS_LABELS: Record<WorkflowRunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  waiting: 'Waiting for you',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Stopped',
};

export const WorkflowStatusBadge = ({
  status,
}: {
  status: WorkflowRunStatus;
}) => (
  <Badge
    variant={
      status === 'done'
        ? 'success'
        : status === 'failed'
          ? 'destructive'
          : status === 'cancelled'
            ? 'muted'
            : status === 'waiting'
              ? 'outline'
              : 'secondary'
    }
    className="gap-1"
  >
    {(status === 'queued' || status === 'running') && (
      <Loader2 className="size-3 animate-spin" />
    )}
    {STATUS_LABELS[status]}
  </Badge>
);
