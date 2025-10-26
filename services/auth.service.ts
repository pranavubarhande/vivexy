import axiosInstance from '@/services/axiosInstance.service';
import {
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  AuthUser,
} from '@/types/user';

// Auth API calls
export const authService = {
  // Login user
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await axiosInstance.post<AuthResponse>(
      '/auth/login',
      credentials
    );
    return response.data;
  },

  // Register user
  register: async (credentials: RegisterCredentials): Promise<AuthResponse> => {
    const response = await axiosInstance.post<AuthResponse>(
      '/auth/register',
      credentials
    );
    return response.data;
  },

  // Get current user
  getCurrentUser: async (): Promise<AuthUser> => {
    const response = await axiosInstance.get<{ user: AuthUser }>('/auth/me');
    if (!response.data.user) {
      throw new Error('Failed to get user');
    }
    return response.data.user;
  },

  // Logout user
  logout: async (): Promise<void> => {
    localStorage.clear();
  },
};
