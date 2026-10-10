import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/auth.service';

// Register mutation
export const useRegister = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authService.register,
    onSuccess: (data) => {
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
  });
};

// Login mutation
export const useLogin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authService.login,
    onSuccess: (data) => {
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
  });
};

// Get current user query
export const useCurrentUser = () => {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: authService.getCurrentUser,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Logout mutation
export const useLogout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      // Clear token from localStorage
      localStorage.clear();

      // Clear all cached data
      queryClient.clear();

      // Redirect to login page
      window.location.href = '/login';
    },
  });
};

// Exchange an OAuth code for a session (used by the /auth/callback page)
export const useExchangeOAuthCode = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authService.exchangeOAuthCode,
    onSuccess: (data) => {
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
  });
};

// Verify an emailed verification token (used by the /verify-email page)
export const useVerifyEmail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authService.verifyEmail,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
  });
};

// Resend the verification email
export const useResendVerification = () => {
  return useMutation({
    mutationFn: authService.resendVerification,
  });
};
