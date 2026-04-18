import axiosInstance from './axiosInstance.service';

export type OfficialSkill = {
  name: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  official: boolean;
  content: string;
  files?: Record<string, string> | null;
};

export type UserSkillPayload = {
  id?: string;
  name: string;
  description?: string;
  content: string;
  files?: Record<string, string> | null;
  enabled: boolean;
  platform?: string;
};

export type UserSkillResponse = {
  id: string;
  name: string;
  description: string;
  content: string;
  files?: Record<string, string> | null;
  enabled: boolean;
  platform: string;
};

export const skillsService = {
  getOfficialSkills: async (): Promise<OfficialSkill[]> => {
    const response =
      await axiosInstance.get<OfficialSkill[]>('/skills/catalog');
    return response.data;
  },

  getUserSkills: async (): Promise<UserSkillResponse[]> => {
    const response =
      await axiosInstance.get<UserSkillResponse[]>('/skills/user');
    return response.data;
  },

  saveUserSkill: async (
    skill: UserSkillPayload
  ): Promise<UserSkillResponse> => {
    const response = await axiosInstance.post<UserSkillResponse>(
      '/skills/user',
      skill
    );
    return response.data;
  },

  updateUserSkill: async (
    skillId: string,
    patch: Partial<Omit<UserSkillPayload, 'id' | 'name'>>
  ): Promise<UserSkillResponse> => {
    const response = await axiosInstance.put<UserSkillResponse>(
      `/skills/user/${skillId}`,
      patch
    );
    return response.data;
  },

  deleteUserSkill: async (skillId: string): Promise<void> => {
    await axiosInstance.delete(`/skills/user/${skillId}`);
  },
};
