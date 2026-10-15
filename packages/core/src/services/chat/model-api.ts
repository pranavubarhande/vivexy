import axiosInstance from '../axiosInstance.service';
import { LLMModel } from '../../types/chat';

export const modelApi = {
  getModels: async (teamId?: string | null) => {
    const response = await axiosInstance.get<LLMModel[]>('/chat/models', {
      params: teamId ? { teamId } : undefined,
    });
    return response.data;
  },
};
