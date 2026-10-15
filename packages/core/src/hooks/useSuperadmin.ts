import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { superadminService } from '../services/superadmin.service';
import {
  ClientUpdateData,
  ListQuery,
  PlatformUserUpdateData,
  UserListQuery,
} from '../types/admin';

export const superadminKeys = {
  all: ['superadmin'] as const,
  overview: () => ['superadmin', 'overview'] as const,
  usage: (days: number) => ['superadmin', 'usage', days] as const,
  clients: (query: ListQuery) => ['superadmin', 'clients', query] as const,
  client: (teamId: string) => ['superadmin', 'client', teamId] as const,
  users: (query: UserListQuery) => ['superadmin', 'users', query] as const,
  user: (userId: string) => ['superadmin', 'user', userId] as const,
  auditLogs: (page: number) => ['superadmin', 'audit-logs', page] as const,
};

export const usePlatformOverview = () =>
  useQuery({
    queryKey: superadminKeys.overview(),
    queryFn: superadminService.getOverview,
    staleTime: 60_000,
  });

export const usePlatformUsage = (days: number) =>
  useQuery({
    queryKey: superadminKeys.usage(days),
    queryFn: () => superadminService.getUsage(days),
    staleTime: 60_000,
  });

export const useClients = (query: ListQuery) =>
  useQuery({
    queryKey: superadminKeys.clients(query),
    queryFn: () => superadminService.getClients(query),
    placeholderData: keepPreviousData,
  });

export const useClient = (teamId: string | null) =>
  useQuery({
    queryKey: superadminKeys.client(teamId ?? ''),
    queryFn: () => superadminService.getClient(teamId as string),
    enabled: !!teamId,
  });

export const usePlatformUsers = (query: UserListQuery) =>
  useQuery({
    queryKey: superadminKeys.users(query),
    queryFn: () => superadminService.getUsers(query),
    placeholderData: keepPreviousData,
  });

export const usePlatformUser = (userId: string | null) =>
  useQuery({
    queryKey: superadminKeys.user(userId ?? ''),
    queryFn: () => superadminService.getUser(userId as string),
    enabled: !!userId,
  });

export const usePlatformAuditLogs = (page: number) =>
  useQuery({
    queryKey: superadminKeys.auditLogs(page),
    queryFn: () => superadminService.getAuditLogs(page),
    placeholderData: keepPreviousData,
  });

export const useUpdateClient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      teamId,
      update,
    }: {
      teamId: string;
      update: ClientUpdateData;
    }) => superadminService.updateClient(teamId, update),
    onSuccess: (client) => {
      queryClient.setQueryData(superadminKeys.client(client.id), client);
      queryClient.invalidateQueries({ queryKey: superadminKeys.all });
    },
  });
};

export const useUpdatePlatformUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      update,
    }: {
      userId: string;
      update: PlatformUserUpdateData;
    }) => superadminService.updateUser(userId, update),
    onSuccess: (user) => {
      queryClient.setQueryData(superadminKeys.user(user.id), user);
      queryClient.invalidateQueries({ queryKey: superadminKeys.all });
    },
  });
};
