import axiosInstance from './axiosInstance.service';
import type {
  PromptList,
  PromptPayload,
  PromptVisibility,
  SavedPrompt,
} from '../types/prompt';

const promptPath = (promptId: string) =>
  `/api/prompts/${encodeURIComponent(promptId)}`;

export const promptsService = {
  list: async (teamId?: string | null): Promise<PromptList> => {
    const response = await axiosInstance.get<PromptList>('/api/prompts', {
      params: teamId ? { teamId } : undefined,
    });
    return response.data;
  },

  create: async (payload: PromptPayload): Promise<SavedPrompt> => {
    const response = await axiosInstance.post<SavedPrompt>(
      '/api/prompts',
      payload
    );
    return response.data;
  },

  update: async ({
    promptId,
    payload,
  }: {
    promptId: string;
    payload: PromptPayload;
  }): Promise<SavedPrompt> => {
    const response = await axiosInstance.put<SavedPrompt>(
      promptPath(promptId),
      payload
    );
    return response.data;
  },

  remove: async (promptId: string): Promise<void> => {
    await axiosInstance.delete(promptPath(promptId));
  },

  duplicate: async ({
    promptId,
    visibility,
    teamId,
  }: {
    promptId: string;
    visibility: PromptVisibility;
    teamId?: string | null;
  }): Promise<SavedPrompt> => {
    const response = await axiosInstance.post<SavedPrompt>(
      `${promptPath(promptId)}/duplicate`,
      { visibility, teamId }
    );
    return response.data;
  },

  render: async ({
    promptId,
    values,
  }: {
    promptId: string;
    values: Record<string, string>;
  }): Promise<string> => {
    const response = await axiosInstance.post<{ text: string }>(
      `${promptPath(promptId)}/render`,
      { values }
    );
    return response.data.text;
  },
};
