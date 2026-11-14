import { useMutation, useQuery } from '@tanstack/react-query';
import { documentsService } from '../services/documents.service';

export const documentKeys = {
  all: ['documents'] as const,
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
