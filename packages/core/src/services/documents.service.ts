import { axiosInstance } from './axiosInstance.service';

export interface DocumentPage {
  documentId: string;
  pageNumber: number;
  pageCount: number;
  text: string;
  ocr: boolean;
}

export const documentsService = {
  getPage: async (documentId: string, pageNumber: number): Promise<DocumentPage> => {
    const { data } = await axiosInstance.get<DocumentPage>(
      `/api/documents/${documentId}/pages/${pageNumber}`
    );
    return data;
  },
};
