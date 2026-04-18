import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/services/user.service';

export const useUserSettings = () =>
  useQuery({
    queryKey: ['user-settings'],
    queryFn: userService.getUserSettings,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: userService.updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
    },
  });
};

export const useUpdatePassword = () =>
  useMutation({
    mutationFn: userService.updatePassword,
  });

export const useDeleteAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: userService.deleteAccount,
    onSuccess: () => {
      // Clear all cached data and logout
      queryClient.clear();
      localStorage.removeItem('token');
      window.location.href = '/login';
    },
  });
};
