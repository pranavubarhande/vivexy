import axiosInstance from '@/services/axiosInstance.service';

export const approvalApi = {
  approveAction: async (chatId: string, requestId: string) => {
    const response = await axiosInstance.post<{ success: boolean }>(
      `/chat/${chatId}/approve`,
      { requestId }
    );
    return response.data;
  },

  rejectAction: async (chatId: string, requestId: string) => {
    const response = await axiosInstance.post<{ success: boolean }>(
      `/chat/${chatId}/reject`,
      { requestId }
    );
    return response.data;
  },

  postToolResult: async (chatId: string, requestId: string, result: string) => {
    const response = await axiosInstance.post<{ success: boolean }>(
      `/chat/${chatId}/tool-result`,
      { requestId, result }
    );
    return response.data;
  },

  cancelTool: async (chatId: string, toolName: string) => {
    const response = await axiosInstance.post<{ success: boolean }>(
      `/chat/${chatId}/cancel_tool`,
      { tool_name: toolName }
    );
    return response.data;
  },
};
