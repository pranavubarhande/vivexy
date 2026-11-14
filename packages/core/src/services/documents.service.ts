import axiosInstance from './axiosInstance.service';
import type { DocumentPage } from '../types/document';

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
};
