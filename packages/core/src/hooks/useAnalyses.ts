import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { analysesService } from '../services/analyses.service';
import type {
  Analysis,
  AnalysisKind,
  AnalysisScope,
  AnalysisStatus,
} from '../types/analysis';

const ACTIVE_POLL_MS = 2_000;

export const ACTIVE_ANALYSIS_STATUSES: AnalysisStatus[] = ['queued', 'running'];

export const isAnalysisActive = (status: AnalysisStatus | undefined) =>
  !!status && ACTIVE_ANALYSIS_STATUSES.includes(status);

export const analysisKeys = {
  all: ['analyses'] as const,
  list: (scope: AnalysisScope, kind?: AnalysisKind) =>
    [
      ...analysisKeys.all,
      'list',
      scope.teamId ?? null,
      scope.scopeType ?? null,
      scope.scopeId ?? null,
      kind ?? null,
    ] as const,
  detail: (analysisId: string) =>
    [...analysisKeys.all, 'detail', analysisId] as const,
};

export const useAnalyses = (scope: AnalysisScope, kind?: AnalysisKind) =>
  useQuery({
    queryKey: analysisKeys.list(scope, kind),
    queryFn: () => analysesService.list(scope, kind),
    refetchInterval: (query) =>
      query.state.data?.some((analysis) => isAnalysisActive(analysis.status))
        ? ACTIVE_POLL_MS
        : false,
  });

/** One analysis with its cells. Polls while it is queued or running so the
 * grid fills in as cells finish. */
export const useAnalysis = (analysisId: string | null | undefined) =>
  useQuery({
    queryKey: analysisKeys.detail(analysisId ?? ''),
    queryFn: () => analysesService.get(analysisId!),
    enabled: !!analysisId,
    refetchInterval: (query) =>
      isAnalysisActive(query.state.data?.status) ? ACTIVE_POLL_MS : false,
  });

const useAnalysisMutation = <TVariables>(
  mutationFn: (variables: TVariables) => Promise<Analysis>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (analysis) => {
      queryClient.setQueryData(analysisKeys.detail(analysis.id), analysis);
      queryClient.invalidateQueries({
        queryKey: [...analysisKeys.all, 'list'],
      });
    },
  });
};

export const useCreateAnalysis = () =>
  useAnalysisMutation(analysesService.create);

export const useCancelAnalysis = () =>
  useAnalysisMutation(analysesService.cancel);

export const useRetryAnalysis = () =>
  useAnalysisMutation(analysesService.retry);

export const useAddAnalysisQuestion = () =>
  useAnalysisMutation(analysesService.addQuestion);

export const useRerunAnalysisQuestion = () =>
  useAnalysisMutation(analysesService.rerunQuestion);

export const useRemoveAnalysisQuestion = () =>
  useAnalysisMutation(analysesService.removeQuestion);

export const useDeleteAnalysis = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: analysesService.remove,
    onSuccess: (_, analysisId) => {
      queryClient.removeQueries({ queryKey: analysisKeys.detail(analysisId) });
      queryClient.invalidateQueries({
        queryKey: [...analysisKeys.all, 'list'],
      });
    },
  });
};

export const useDownloadAnalysis = () =>
  useMutation({ mutationFn: analysesService.download });
