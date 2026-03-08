import axiosInstance from '@/services/axiosInstance.service';
import { LLMModel } from '@/types/chat';

export const modelApi = {
  getModels: async () => {
    const response = await axiosInstance.get<LLMModel[]>('/chat/models');
    return response.data;
  },
};
