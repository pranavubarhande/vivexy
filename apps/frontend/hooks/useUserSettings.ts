import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/services/user.service';
import { toast } from 'sonner';

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
      queryClient.clear();
      localStorage.removeItem('token');
      window.location.href = '/login';
    },
  });
};

export const useApiKeys = () =>
  useQuery({
    queryKey: ['api-keys'],
    queryFn: userService.getApiKeys,
    staleTime: 5 * 60 * 1000,
  });

export const useSetApiKey = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, apiKey }: { provider: string; apiKey: string }) =>
      userService.setApiKey(provider, apiKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key saved');
    },
    onError: () => toast.error('Failed to save API key'),
  });
};

export const useDeleteApiKey = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: string) => userService.deleteApiKey(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key removed');
    },
    onError: () => toast.error('Failed to remove API key'),
  });
};
