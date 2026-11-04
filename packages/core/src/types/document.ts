export interface DocumentPage {
  documentId: string;
  pageNumber: number;
  pageCount: number | null;
  text: string;
  ocr: boolean;
}
