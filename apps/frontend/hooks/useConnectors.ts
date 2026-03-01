import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { connectorsService } from '@/services/connectors.service';

export const useConnections = () =>
  useQuery({
    queryKey: ['connectors', 'active'],
    queryFn: connectorsService.getConnections,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

export const useGenerateConnection = () => {
  return useMutation({
    mutationFn: (appId: string) =>
      connectorsService.generateConnectionLink(appId),
  });
};

export const useDisconnectConnection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (appId: string) =>
      connectorsService.disconnectConnection(appId),
    onSuccess: () => {
      // Refresh the connected tools list
      queryClient.invalidateQueries({ queryKey: ['connectors', 'active'] });
    },
  });
};
