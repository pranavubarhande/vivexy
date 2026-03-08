import { platform } from '@/lib/platform';
import axiosInstance from '@/services/axiosInstance.service';
import { Artifact } from '@/types/chat';

export const artifactApi = {
  getChatArtifacts: async (chatId: string) => {
    if (platform.isDesktop) {
      const artifacts = await platform.listArtifacts(chatId);
      return artifacts as Artifact[];
    }
    const response = await axiosInstance.get<Artifact[]>(
      `/chat/${chatId}/artifacts`
    );
    return response.data;
  },

  createArtifact: async (
    chatId: string,
    data: {
      title?: string;
      type: string;
      filename?: string;
      language?: string;
      content: string;
      seq?: number;
    }
  ) => {
    if (platform.isDesktop) {
      const payload = { chat_id: chatId, ...data };
      const resStr = await platform.executeTool('create_artifact', payload);
      const res = JSON.parse(resStr);
      if (!res.success) throw new Error(res.error);
      return res.artifact as Artifact;
    }
    const payload = { chatId, seq: 1, ...data };
    const response = await axiosInstance.post<Artifact>(
      `/chat/${chatId}/artifacts`,
      payload
    );
    return response.data;
  },

  exportArtifact: async (
    chatId: string,
    artifactId: string,
    format: 'pdf' | 'docx'
  ) => {
    const response = await axiosInstance.get<Blob>(
      `/chat/${chatId}/artifacts/${artifactId}/export?format=${format}`,
      { responseType: 'blob' }
    );
    return response.data;
  },

  exportContent: async (
    chatId: string,
    content: string,
    format: 'pdf' | 'docx'
  ) => {
    const response = await axiosInstance.post<Blob>(
      `/chat/${chatId}/export-content`,
      { content, format },
      { responseType: 'blob' }
    );
    return response.data;
  },
};
