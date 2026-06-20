import axiosInstance from './axiosInstance.service';

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  messageCount: number;
  periodDays: number;
}

export interface ModelUsage {
  modelName: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  messageCount: number;
}

export interface DailyUsage {
  date: string;
  totalTokens: number;
  totalCostUsd: number;
  messageCount: number;
}

export interface UsageRecord {
  id: string;
  userId: string;
  messageId: string | null;
  modelId: string | null;
  modelName: string | null;
  provider: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  createdAt: string;
}

export const costService = {
  getSummary: async (days = 30): Promise<UsageSummary> => {
    const { data } = await axiosInstance.get('/usage/summary', {
      params: { days },
    });
    return data;
  },

  getByModel: async (days = 30): Promise<ModelUsage[]> => {
    const { data } = await axiosInstance.get('/usage/by-model', {
      params: { days },
    });
    return data;
  },

  getDaily: async (days = 30): Promise<DailyUsage[]> => {
    const { data } = await axiosInstance.get('/usage/daily', {
      params: { days },
    });
    return data;
  },

  getRecent: async (limit = 50): Promise<UsageRecord[]> => {
    const { data } = await axiosInstance.get('/usage/recent', {
      params: { limit },
    });
    return data;
  },
};
