import axiosInstance from './axiosInstance.service';
import {
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  AuthUser,
} from '../types/user';

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

  // Exchange a one-time OAuth code for the real session token. `state` is
  // the nonce generated before redirecting to /auth/oauth/<provider>/login
  // (stored in sessionStorage) — the backend requires it to match what the
  // code was bound to, closing an OAuth login-CSRF gap where a bare code
  // alone would be redeemable by any browser, not just the one that
  // completed the provider's consent screen.
  exchangeOAuthCode: async ({
    code,
    state,
  }: {
    code: string;
    state: string;
  }): Promise<AuthResponse> => {
    const response = await axiosInstance.post<AuthResponse>(
      '/auth/oauth/exchange',
      { code, state }
    );
    return response.data;
  },

  // Verify an emailed verification token
  verifyEmail: async (token: string): Promise<{ success: boolean }> => {
    const response = await axiosInstance.post<{ success: boolean }>(
      '/auth/verify-email',
      { token }
    );
    return response.data;
  },

  // Resend the verification email (requires an authenticated session)
  resendVerification: async (): Promise<{ success: boolean }> => {
    const response = await axiosInstance.post<{ success: boolean }>(
      '/auth/resend-verification'
    );
    return response.data;
  },
};
