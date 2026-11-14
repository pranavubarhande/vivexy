'use client';

import { Loader2 } from 'lucide-react';
import { Badge } from '@vivexy/ui/badge';
import type { AnalysisStatus } from '../../types/analysis';

const STATUS_LABELS: Record<AnalysisStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Stopped',
};

export const AnalysisStatusBadge = ({ status }: { status: AnalysisStatus }) => (
  <Badge
    variant={
      status === 'done'
        ? 'success'
        : status === 'failed'
          ? 'destructive'
          : status === 'cancelled'
            ? 'muted'
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
