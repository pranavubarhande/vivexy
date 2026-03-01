import axiosInstance from './axiosInstance.service';

export const connectorsService = {
  getConnections: async (): Promise<string[]> => {
    const response = await axiosInstance.get<string[]>(
      '/api/connectors/active'
    );
    return response.data;
  },

  generateConnectionLink: async (appId: string): Promise<{ url: string }> => {
    const response = await axiosInstance.get<{ url: string }>(
      `/api/connectors/generate_link?app=${appId}`
    );
    return response.data;
  },

  disconnectConnection: async (appId: string): Promise<void> => {
    await axiosInstance.post('/api/connectors/disconnect', { app: appId });
  },
};
