'use client';

import { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Loader2,
  Play,
  Square,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@vivexy/ui/badge';
import { Button } from '@vivexy/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@vivexy/ui/alert-dialog';
import {
  isWorkflowActive,
  useCancelWorkflow,
  useDeleteWorkflowRun,
  useDownloadWorkflowRun,
  useEditWorkflowStep,
  useRerunWorkflowStep,
  useResumeWorkflow,
  useWorkflowRun,
} from '../../hooks/useWorkflows';
import { getApiErrorMessage } from '../../lib/admin-format';
import { WorkflowStatusBadge } from './workflow-status-badge';
import { WorkflowStepCard } from './workflow-step-card';

interface WorkflowRunViewProps {
  runId: string;
  onBack: () => void;
  analysisHref?: (analysisId: string) => string;
}

export const WorkflowRunView = ({
  runId,
  onBack,
  analysisHref,
}: WorkflowRunViewProps) => {
  const { data: run, isLoading, error } = useWorkflowRun(runId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const resume = useResumeWorkflow();
  const cancel = useCancelWorkflow();
  const editStep = useEditWorkflowStep();
  const rerunStep = useRerunWorkflowStep();
  const remove = useDeleteWorkflowRun();
  const download = useDownloadWorkflowRun();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading workflow…
      </div>
    );
  }
  if (error || !run) {
    return (
      <div className="space-y-3 py-16 text-center text-sm text-muted-foreground">
        <p>This workflow run could not be found.</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          Back to workflows
        </Button>
      </div>
    );
  }

  const active = isWorkflowActive(run.status);
  const onError = (fallback: string) => (mutationError: unknown) =>
    toast.error(getApiErrorMessage(mutationError, fallback));
  const lastDone = run.steps.reduce(
    (last, step, index) => (step.status === 'done' ? index : last),
    -1
  );
  const canContinue =
    !active &&
    run.status !== 'done' &&
    run.steps.some((step) => step.status !== 'done');
  const hasOutput = run.steps.some((step) => step.status === 'done');

  return (
    <div className="space-y-4" data-testid="workflow-run">
      <div className="flex flex-wrap items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onBack}
          aria-label="Back to workflows"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{run.title}</h2>
            <Badge variant="muted">{run.workflowName}</Badge>
            <WorkflowStatusBadge status={run.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {run.progress.done} of {run.progress.total} steps done ·{' '}
            {run.documentIds.length} document
            {run.documentIds.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canContinue && (
            <Button
              size="sm"
              disabled={resume.isPending}
              onClick={() =>
                resume.mutate(run.id, {
                  onError: onError('Could not continue'),
                })
              }
            >
              <Play className="size-3.5" />
              {run.status === 'failed' ? 'Retry' : 'Continue'}
            </Button>
          )}
          {active && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                cancel.mutate(run.id, { onError: onError('Could not stop') })
              }
            >
              <Square className="size-3.5" />
              Stop
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!hasOutput || download.isPending}
            onClick={() =>
              download.mutate(run.id, {
                onSuccess: (filename) =>
                  toast.success(`Downloaded ${filename}`),
                onError: onError('Could not export'),
              })
            }
          >
            <Download className="size-3.5" />
            Export to Word
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Delete run"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {run.inputs.some((input) => input.value) && (
        <dl className="grid gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:grid-cols-[12rem_1fr]">
          {run.inputs
            .filter((input) => input.value)
            .map((input) => (
              <div key={input.key} className="contents">
                <dt className="text-muted-foreground">{input.label}</dt>
                <dd className="whitespace-pre-wrap">{input.value}</dd>
              </div>
            ))}
        </dl>
      )}

      {run.status === 'waiting' && (
        <p
          data-testid="workflow-waiting"
          className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
        >
          Check step {lastDone + 1}, edit it if needed, then continue.
        </p>
      )}
      {run.status === 'failed' && run.error && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="size-4" />
          {run.error}
        </p>
      )}

      <ol className="space-y-3">
        {run.steps.map((step, index) => (
          <WorkflowStepCard
            key={`${step.key}-${step.completedAt ?? step.status}`}
            step={step}
            index={index}
            locked={active}
            isPausePoint={run.status === 'waiting' && index === lastDone}
            analysisHref={analysisHref}
            isSaving={editStep.isPending}
            onSave={(output) =>
              editStep.mutate(
                { runId: run.id, stepKey: step.key, output },
                { onError: onError('Could not save the step') }
              )
            }
            onRerun={() =>
              rerunStep.mutate(
                { runId: run.id, stepKey: step.key },
                { onError: onError('Could not re-run the step') }
              )
            }
          />
        ))}
      </ol>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this run?</AlertDialogTitle>
            <AlertDialogDescription>
              Every step&apos;s output is deleted. The documents stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                remove.mutate(run.id, {
                  onSuccess: onBack,
                  onError: onError('Could not delete the run'),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
