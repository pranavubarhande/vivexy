import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workflowsService } from '../services/workflows.service';
import type { AnalysisScope } from '../types/analysis';
import type { WorkflowRun, WorkflowRunStatus } from '../types/workflow';

const ACTIVE_POLL_MS = 2_000;

export const isWorkflowActive = (status: WorkflowRunStatus | undefined) =>
  status === 'queued' || status === 'running';

export const workflowKeys = {
  all: ['workflows'] as const,
  definitions: () => [...workflowKeys.all, 'definitions'] as const,
  runs: (scope: AnalysisScope) =>
    [
      ...workflowKeys.all,
      'runs',
      scope.teamId ?? null,
      scope.scopeType ?? null,
      scope.scopeId ?? null,
    ] as const,
  run: (runId: string) => [...workflowKeys.all, 'run', runId] as const,
};

export const useWorkflowDefinitions = () =>
  useQuery({
    queryKey: workflowKeys.definitions(),
    queryFn: workflowsService.definitions,
    staleTime: 5 * 60_000,
  });

export const useWorkflowRuns = (scope: AnalysisScope) =>
  useQuery({
    queryKey: workflowKeys.runs(scope),
    queryFn: () => workflowsService.runs(scope),
    refetchInterval: (query) =>
      query.state.data?.some((run) => isWorkflowActive(run.status))
        ? ACTIVE_POLL_MS
        : false,
  });

/** One run with its steps. Polls while a step is running. */
export const useWorkflowRun = (runId: string | null | undefined) =>
  useQuery({
    queryKey: workflowKeys.run(runId ?? ''),
    queryFn: () => workflowsService.get(runId!),
    enabled: !!runId,
    refetchInterval: (query) =>
      isWorkflowActive(query.state.data?.status) ? ACTIVE_POLL_MS : false,
  });

const useRunMutation = <TVariables>(
  mutationFn: (variables: TVariables) => Promise<WorkflowRun>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (run) => {
      queryClient.setQueryData(workflowKeys.run(run.id), run);
      queryClient.invalidateQueries({
        queryKey: [...workflowKeys.all, 'runs'],
      });
    },
  });
};

export const useStartWorkflow = () => useRunMutation(workflowsService.start);
export const useResumeWorkflow = () => useRunMutation(workflowsService.resume);
export const useCancelWorkflow = () => useRunMutation(workflowsService.cancel);
export const useEditWorkflowStep = () =>
  useRunMutation(workflowsService.editStep);
export const useRerunWorkflowStep = () =>
  useRunMutation(workflowsService.rerunStep);

export const useDeleteWorkflowRun = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: workflowsService.remove,
    onSuccess: (_, runId) => {
      queryClient.removeQueries({ queryKey: workflowKeys.run(runId) });
      queryClient.invalidateQueries({
        queryKey: [...workflowKeys.all, 'runs'],
      });
    },
  });
};

export const useDownloadWorkflowRun = () =>
  useMutation({ mutationFn: workflowsService.download });
