import axiosInstance from './axiosInstance.service';
import type { AnalysisScope } from '../types/analysis';
import type {
  DocumentList,
  DocumentPage,
  StoredDocument,
} from '../types/document';

const scopeParams = (scope: AnalysisScope) => ({
  ...(scope.teamId ? { teamId: scope.teamId } : {}),
  ...(scope.scopeType && scope.scopeId
    ? { scopeType: scope.scopeType, scopeId: scope.scopeId }
    : {}),
});

export const documentsService = {
  getPage: async (
    documentId: string,
    pageNumber: number
  ): Promise<DocumentPage> => {
    const response = await axiosInstance.get<DocumentPage>(
      `/api/documents/${documentId}/pages/${pageNumber}`
    );
    return response.data;
  },

  getFileUrl: async (documentId: string): Promise<string> => {
    const response = await axiosInstance.get<{ url: string }>(
      `/api/documents/${documentId}/file`
    );
    return response.data.url;
  },

  list: async (scope: AnalysisScope): Promise<DocumentList> => {
    const response = await axiosInstance.get<DocumentList>('/api/documents', {
      params: { ...scopeParams(scope), pageSize: 200 },
    });
    return response.data;
  },

  upload: async ({
    files,
    scope,
  }: {
    files: File[];
    scope: AnalysisScope;
  }): Promise<StoredDocument[]> => {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    Object.entries(scopeParams(scope)).forEach(([key, value]) =>
      form.append(key, value)
    );
    const response = await axiosInstance.post<{ documents: StoredDocument[] }>(
      '/api/documents',
      form
    );
    return response.data.documents;
  },
};

export { scopeParams };
