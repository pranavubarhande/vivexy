export interface DocumentPage {
  documentId: string;
  pageNumber: number;
  pageCount: number | null;
  text: string;
  ocr: boolean;
}

export type DocumentStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface StoredDocument {
  id: string;
  teamId: string | null;
  scopeType: string | null;
  scopeId: string | null;
  filename: string;
  mimeType: string;
  size: number;
  status: DocumentStatus;
  stage: string | null;
  error: string | null;
  paginated: boolean;
  pageCount: number | null;
  createdAt: string | null;
}

export interface DocumentList {
  documents: StoredDocument[];
  total: number;
  page: number;
  pageSize: number;
}
