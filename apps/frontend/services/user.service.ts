import axiosInstance from '@/services/axiosInstance.service';
import { AuthUser } from '@/types/user';

// User settings API calls
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
  deleteAccount: async (): Promise<void> => {
    await axiosInstance.delete('/users/me');
  },
};
