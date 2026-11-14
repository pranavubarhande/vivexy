import axiosInstance from './axiosInstance.service';
import { scopeParams } from './documents.service';
import type {
  Analysis,
  AnalysisKind,
  AnalysisQuestionInput,
  AnalysisScope,
  AnalysisSummary,
  CreateAnalysisPayload,
} from '../types/analysis';

const FILENAME_PATTERN = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i;

export const analysesService = {
  list: async (
    scope: AnalysisScope,
    kind?: AnalysisKind
  ): Promise<AnalysisSummary[]> => {
    const response = await axiosInstance.get<{ analyses: AnalysisSummary[] }>(
      '/api/analyses',
      { params: { ...scopeParams(scope), ...(kind ? { kind } : {}) } }
    );
    return response.data.analyses;
  },

  get: async (analysisId: string): Promise<Analysis> => {
    const response = await axiosInstance.get<Analysis>(
      `/api/analyses/${analysisId}`
    );
    return response.data;
  },

  create: async (payload: CreateAnalysisPayload): Promise<Analysis> => {
    const response = await axiosInstance.post<Analysis>(
      '/api/analyses',
      payload
    );
    return response.data;
  },

  cancel: async (analysisId: string): Promise<Analysis> => {
    const response = await axiosInstance.post<Analysis>(
      `/api/analyses/${analysisId}/cancel`
    );
    return response.data;
  },

  retry: async (analysisId: string): Promise<Analysis> => {
    const response = await axiosInstance.post<Analysis>(
      `/api/analyses/${analysisId}/retry`
    );
    return response.data;
  },

  remove: async (analysisId: string): Promise<void> => {
    await axiosInstance.delete(`/api/analyses/${analysisId}`);
  },

  addQuestion: async ({
    analysisId,
    question,
  }: {
    analysisId: string;
    question: AnalysisQuestionInput;
  }): Promise<Analysis> => {
    const response = await axiosInstance.post<Analysis>(
      `/api/analyses/${analysisId}/questions`,
      question
    );
    return response.data;
  },

  rerunQuestion: async ({
    analysisId,
    questionId,
    question,
  }: {
    analysisId: string;
    questionId: string;
    question?: AnalysisQuestionInput;
  }): Promise<Analysis> => {
    const response = await axiosInstance.post<Analysis>(
      `/api/analyses/${analysisId}/questions/${questionId}/rerun`,
      question ?? {}
    );
    return response.data;
  },

  removeQuestion: async ({
    analysisId,
    questionId,
  }: {
    analysisId: string;
    questionId: string;
  }): Promise<Analysis> => {
    const response = await axiosInstance.delete<Analysis>(
      `/api/analyses/${analysisId}/questions/${questionId}`
    );
    return response.data;
  },

  /** Downloads the Excel or Word export through the browser. */
  download: async (analysisId: string): Promise<string> => {
    const response = await axiosInstance.get<Blob>(
      `/api/analyses/${analysisId}/export`,
      { responseType: 'blob' }
    );
    const disposition = String(response.headers['content-disposition'] ?? '');
    const filename = decodeURIComponent(
      disposition.match(FILENAME_PATTERN)?.[1] ?? 'analysis'
    );
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return filename;
  },
};
