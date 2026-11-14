import axiosInstance from './axiosInstance.service';
import { scopeParams } from './documents.service';
import type { AnalysisScope } from '../types/analysis';
import type {
  StartWorkflowPayload,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowRunSummary,
} from '../types/workflow';
import { downloadBlob } from '../lib/download';

const runPath = (runId: string) => `/api/workflows/runs/${runId}`;

export const workflowsService = {
  definitions: async (): Promise<WorkflowDefinition[]> => {
    const response = await axiosInstance.get<{
      workflows: WorkflowDefinition[];
    }>('/api/workflows');
    return response.data.workflows;
  },

  runs: async (scope: AnalysisScope): Promise<WorkflowRunSummary[]> => {
    const response = await axiosInstance.get<{ runs: WorkflowRunSummary[] }>(
      '/api/workflows/runs',
      { params: scopeParams(scope) }
    );
    return response.data.runs;
  },

  get: async (runId: string): Promise<WorkflowRun> => {
    const response = await axiosInstance.get<WorkflowRun>(runPath(runId));
    return response.data;
  },

  start: async (payload: StartWorkflowPayload): Promise<WorkflowRun> => {
    const response = await axiosInstance.post<WorkflowRun>(
      '/api/workflows/runs',
      payload
    );
    return response.data;
  },

  resume: async (runId: string): Promise<WorkflowRun> => {
    const response = await axiosInstance.post<WorkflowRun>(
      `${runPath(runId)}/continue`
    );
    return response.data;
  },

  cancel: async (runId: string): Promise<WorkflowRun> => {
    const response = await axiosInstance.post<WorkflowRun>(
      `${runPath(runId)}/cancel`
    );
    return response.data;
  },

  remove: async (runId: string): Promise<void> => {
    await axiosInstance.delete(runPath(runId));
  },

  editStep: async ({
    runId,
    stepKey,
    output,
  }: {
    runId: string;
    stepKey: string;
    output: string;
  }): Promise<WorkflowRun> => {
    const response = await axiosInstance.put<WorkflowRun>(
      `${runPath(runId)}/steps/${stepKey}`,
      { output }
    );
    return response.data;
  },

  rerunStep: async ({
    runId,
    stepKey,
  }: {
    runId: string;
    stepKey: string;
  }): Promise<WorkflowRun> => {
    const response = await axiosInstance.post<WorkflowRun>(
      `${runPath(runId)}/steps/${stepKey}/rerun`
    );
    return response.data;
  },

  download: async (runId: string): Promise<string> =>
    downloadBlob(`${runPath(runId)}/export`, 'workflow.docx'),
};
