import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentsService } from '../services/documents.service';
import type { AnalysisScope } from '../types/analysis';

const PROCESSING_POLL_MS = 3_000;

export const documentKeys = {
  all: ['documents'] as const,
  list: (scope: AnalysisScope) =>
    [
      ...documentKeys.all,
      'list',
      scope.teamId ?? null,
      scope.scopeType ?? null,
      scope.scopeId ?? null,
    ] as const,
  page: (documentId: string, pageNumber: number) =>
    [...documentKeys.all, documentId, 'pages', pageNumber] as const,
};

export const useDocumentPage = (
  documentId: string | null | undefined,
  pageNumber: number
) =>
  useQuery({
    queryKey: documentKeys.page(documentId ?? '', pageNumber),
    queryFn: () => documentsService.getPage(documentId!, pageNumber),
    enabled: !!documentId && pageNumber > 0,
    staleTime: 10 * 60_000,
    retry: false,
  });

export const useDocumentFileUrl = () =>
  useMutation({ mutationFn: documentsService.getFileUrl });

/** Documents in a team, personal space or scope. Polls while any are still
 * being processed. */
export const useScopeDocuments = (scope: AnalysisScope, enabled = true) =>
  useQuery({
    queryKey: documentKeys.list(scope),
    queryFn: () => documentsService.list(scope),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.documents.some(
        (document) =>
          document.status === 'queued' || document.status === 'processing'
      )
        ? PROCESSING_POLL_MS
        : false,
  });

export const useUploadDocuments = (scope: AnalysisScope) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => documentsService.upload({ files, scope }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: documentKeys.list(scope) }),
  });
};
