'use client';

import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@vivexy/ui/utils';
import { Badge } from '@vivexy/ui/badge';
import { Button } from '@vivexy/ui/button';
import { Textarea } from '@vivexy/ui/textarea';
import { MessageCitations } from '../chat/message-citations';
import { MessageStream } from '../chat/message-stream';
import type { WorkflowRunStep } from '../../types/workflow';

const STATUS_ICONS = {
  pending: Circle,
  running: Loader2,
  done: CheckCircle2,
  failed: AlertCircle,
} as const;

const KIND_LABELS = {
  write: null,
  review: 'Review grid',
  summary: 'Summaries',
  timeline: 'Timeline',
} as const;

interface WorkflowStepCardProps {
  step: WorkflowRunStep;
  index: number;
  locked: boolean;
  isPausePoint: boolean;
  analysisHref?: (analysisId: string) => string;
  onSave: (output: string) => void;
  onRerun: () => void;
  isSaving: boolean;
}

export const WorkflowStepCard = ({
  step,
  index,
  locked,
  isPausePoint,
  analysisHref,
  onSave,
  onRerun,
  isSaving,
}: WorkflowStepCardProps) => {
  const [draft, setDraft] = useState<string | null>(null);
  const StatusIcon = STATUS_ICONS[step.status];
  const kindLabel = KIND_LABELS[step.kind];

  return (
    <li
      data-testid="workflow-step"
      data-status={step.status}
      className={cn(
        'rounded-lg border bg-card',
        isPausePoint ? 'border-amber-500/60' : 'border-border'
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <StatusIcon
          className={cn(
            'mt-0.5 size-4 shrink-0',
            step.status === 'done' && 'text-emerald-600 dark:text-emerald-400',
            step.status === 'running' && 'animate-spin text-primary',
            step.status === 'failed' && 'text-destructive',
            step.status === 'pending' && 'text-muted-foreground'
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">
              {index + 1}. {step.title}
            </h3>
            {kindLabel && <Badge variant="muted">{kindLabel}</Badge>}
            {step.pause && <Badge variant="outline">Check</Badge>}
            {step.edited && <Badge variant="secondary">Edited</Badge>}
          </div>
          {step.description && (
            <p className="text-xs text-muted-foreground">{step.description}</p>
          )}
        </div>
        {step.status === 'done' && !locked && draft === null && (
          <div className="flex shrink-0 gap-1">
            {step.analysisId && analysisHref && (
              <Button asChild variant="ghost" size="sm">
                <a href={analysisHref(step.analysisId)}>
                  <ExternalLink className="size-3.5" />
                  Open
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(step.output ?? '')}
            >
              <Pencil className="size-3.5" />
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onRerun}>
              <RotateCcw className="size-3.5" />
              Re-run
            </Button>
          </div>
        )}
      </div>

      {step.status === 'running' && (
        <p className="px-4 pb-3 pl-11 text-xs text-muted-foreground">
          Working on this step…
        </p>
      )}
      {step.status === 'failed' && (
        <p className="px-4 pb-3 pl-11 text-sm text-destructive">
          {step.error ?? 'This step failed'}
        </p>
      )}
      {step.status === 'done' && draft !== null && (
        <div className="space-y-2 border-t border-border px-4 py-3">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={12}
            aria-label={`Edit ${step.title}`}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Saving clears the steps after this one; continue the run to redo
            them with your edits.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSaving || !draft.trim()}
              onClick={() => {
                onSave(draft);
                setDraft(null);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      )}
      {step.status === 'done' && draft === null && step.output && (
        <div className="border-t border-border px-4 py-2">
          <MessageCitations
            message={{
              id: `${step.key}-output`,
              role: 'assistant',
              content: step.output,
              citations: step.citations,
              createdAt: '',
            }}
          >
            <MessageStream content={step.output} role="assistant" />
          </MessageCitations>
        </div>
      )}
    </li>
  );
};
