import axiosInstance from './axiosInstance.service';
import { AuthUser } from '../types/user';

export interface UserApiKey {
  provider: string;
  hasKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export const userService = {
  // Get user settings
  getUserSettings: async (): Promise<AuthUser> => {
    const response = await axiosInstance.get<{ user: AuthUser }>('/users/me');
    if (!response.data.user) {
      throw new Error('Failed to get user settings');
    }
    return response.data.user;
  },

  // Update profile
  updateProfile: async (data: {
    name?: string;
    email?: string;
  }): Promise<AuthUser> => {
    const response = await axiosInstance.patch<{ user: AuthUser }>(
      '/users/me',
      data
    );
    if (!response.data.user) {
      throw new Error('Failed to update profile');
    }
    return response.data.user;
  },

  // Update password
  updatePassword: async (data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<void> => {
    await axiosInstance.put('/users/me', data);
  },

  // Delete account
  exportMyData: async (): Promise<Blob> => {
    const { data } = await axiosInstance.get('/users/me/export');
    return new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
  },

  deleteAccount: async (): Promise<void> => {
    await axiosInstance.delete('/users/me');
  },

  // BYOK API key management
  getApiKeys: async (): Promise<UserApiKey[]> => {
    const response =
      await axiosInstance.get<UserApiKey[]>('/users/me/api-keys');
    return response.data;
  },

  setApiKey: async (provider: string, apiKey: string): Promise<UserApiKey> => {
    const response = await axiosInstance.put<UserApiKey>(
      `/users/me/api-keys/${provider}`,
      { apiKey }
    );
    return response.data;
  },

  deleteApiKey: async (provider: string): Promise<void> => {
    await axiosInstance.delete(`/users/me/api-keys/${provider}`);
  },
};
