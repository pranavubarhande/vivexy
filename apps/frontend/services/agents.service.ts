import axiosInstance from './axiosInstance.service';
import type { DeployedAgent } from '@/types/agent';

export const agentsService = {
  getDeployedAgents: async (): Promise<DeployedAgent[]> => {
    const response = await axiosInstance.get<DeployedAgent[]>('/agents/user');
    return response.data;
  },

  deployAgent: async (agentId: string): Promise<DeployedAgent> => {
    const response = await axiosInstance.post<DeployedAgent>('/agents/user', {
      agentId,
    });
    return response.data;
  },

  undeployAgent: async (agentId: string): Promise<void> => {
    await axiosInstance.delete(`/agents/user/${agentId}`);
  },
};
