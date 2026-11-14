import type { AnalysisScope } from './analysis';
import type { Citation } from './chat';
import type { PromptField } from './prompt';

export type WorkflowStepKind = 'write' | 'review' | 'summary' | 'timeline';
export type WorkflowRunStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'done'
  | 'failed'
  | 'cancelled';
export type WorkflowStepStatus = 'pending' | 'running' | 'done' | 'failed';

export interface WorkflowStepDefinition {
  key: string;
  title: string;
  kind: WorkflowStepKind;
  pause: boolean;
  description: string;
}

export interface WorkflowDefinition {
  key: string;
  name: string;
  description: string;
  category: string;
  documents: 'required' | 'optional' | 'none';
  documentsHint: string;
  maxDocuments: number;
  inputs: PromptField[];
  steps: WorkflowStepDefinition[];
}

export interface WorkflowRunInput {
  key: string;
  label: string;
  value: string;
}

export interface WorkflowRunSummary {
  id: string;
  teamId: string | null;
  scopeType: string | null;
  scopeId: string | null;
  workflowKey: string;
  workflowName: string;
  title: string;
  status: WorkflowRunStatus;
  inputs: WorkflowRunInput[];
  documentIds: string[];
  modelId: string | null;
  error: string | null;
  progress: { total: number; done: number };
  inputTokens: number;
  outputTokens: number;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

export interface WorkflowRunStep extends WorkflowStepDefinition {
  status: WorkflowStepStatus;
  output: string | null;
  citations: Citation[];
  analysisId: string | null;
  edited: boolean;
  error: string | null;
  completedAt: string | null;
}

export interface WorkflowRun extends WorkflowRunSummary {
  steps: WorkflowRunStep[];
}

export interface StartWorkflowPayload extends AnalysisScope {
  workflowKey: string;
  title?: string;
  documentIds: string[];
  inputs: Record<string, string>;
  modelId: string;
}
