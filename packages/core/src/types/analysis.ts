import type { Citation } from './chat';

export type AnalysisKind = 'review' | 'summary' | 'timeline';
export type AnalysisStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled';
export type AnalysisResultStatus = 'pending' | 'done' | 'failed';
export type SummaryLength = 'short' | 'detailed';

export interface AnalysisScope {
  teamId?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
}

export interface AnalysisQuestion {
  id: string;
  label: string;
  prompt: string;
}

export interface AnalysisQuestionInput {
  label: string;
  prompt: string;
}

export interface AnalysisProgress {
  total: number;
  done: number;
  failed: number;
}

export interface AnalysisSummary {
  id: string;
  teamId: string | null;
  ownerId: string;
  scopeType: string | null;
  scopeId: string | null;
  kind: AnalysisKind;
  title: string;
  status: AnalysisStatus;
  documentIds: string[];
  questions: AnalysisQuestion[];
  options: { length?: SummaryLength };
  modelId: string | null;
  error: string | null;
  progress: AnalysisProgress;
  inputTokens: number;
  outputTokens: number;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

export interface AnalysisDocument {
  id: string;
  filename: string;
  available: boolean;
}

export interface AnalysisResult {
  id: string;
  documentId: string;
  questionId: string | null;
  status: AnalysisResultStatus;
  answer: string | null;
  found: boolean | null;
  citations: Citation[];
  error: string | null;
}

export interface TimelineEvent {
  date: string | null;
  sortDate: string | null;
  event: string;
  people: string[];
  documentId: string;
  filename: string | null;
  citations: Citation[];
}

export interface Analysis extends AnalysisSummary {
  documents: AnalysisDocument[];
  results: AnalysisResult[];
  events?: TimelineEvent[];
}

export interface CreateAnalysisPayload extends AnalysisScope {
  kind: AnalysisKind;
  title?: string;
  documentIds: string[];
  questions?: AnalysisQuestionInput[];
  modelId: string;
  length?: SummaryLength;
}
