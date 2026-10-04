import axiosInstance from '../axiosInstance.service';
import { UploadedFile } from '@/components/chat/file-upload';
import { platform } from '@/lib/platform';

export const attachmentApi = {
  uploadAttachment: async (chatId: string, file: File) => {
    if (platform.isDesktop) {
      const buffer = await file.arrayBuffer();
      const resultJson = await platform.saveLocalFile(
        chatId,
        file.name,
        buffer
      );
      const result = JSON.parse(resultJson);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save file locally');
      }
      return {
        id: crypto.randomUUID(),
        filename: file.name,
        s3Key: result.filePath,
        mimeType: file.type,
        size: file.size,
      };
    }

    const formData = new FormData();
    formData.append('file', file);

    const response = await axiosInstance.post<UploadedFile>(
      `/chat/${chatId}/attachments`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },
};
