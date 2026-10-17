import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { adminService } from '../services/admin.service';
import { TeamRole } from '../types/team';
import { TeamSettingsData } from '../types/admin';

export const adminKeys = {
  all: ['admin'] as const,
  teams: () => ['admin', 'teams'] as const,
  team: (teamId: string) => ['admin', 'team', teamId] as const,
  overview: (teamId: string, days: number) =>
    ['admin', 'team', teamId, 'overview', days] as const,
  members: (teamId: string, days: number) =>
    ['admin', 'team', teamId, 'members', days] as const,
  invites: (teamId: string) => ['admin', 'team', teamId, 'invites'] as const,
  auditLogs: (teamId: string, page: number) =>
    ['admin', 'team', teamId, 'audit-logs', page] as const,
};

export const useAdministeredTeams = (enabled = true) =>
  useQuery({
    queryKey: adminKeys.teams(),
    queryFn: adminService.getTeams,
    staleTime: 5 * 60 * 1000,
    enabled,
  });

export const useTeamAdminOverview = (teamId: string, days: number) =>
  useQuery({
    queryKey: adminKeys.overview(teamId, days),
    queryFn: () => adminService.getOverview(teamId, days),
    enabled: !!teamId,
    staleTime: 60_000,
  });

export const useTeamAdminMembers = (teamId: string, days: number) =>
  useQuery({
    queryKey: adminKeys.members(teamId, days),
    queryFn: () => adminService.getMembers(teamId, days),
    enabled: !!teamId,
    staleTime: 60_000,
  });

export const useTeamAdminInvites = (teamId: string) =>
  useQuery({
    queryKey: adminKeys.invites(teamId),
    queryFn: () => adminService.getInvites(teamId),
    enabled: !!teamId,
    staleTime: 60_000,
  });

export const useTeamAuditLogs = (teamId: string, page: number) =>
  useQuery({
    queryKey: adminKeys.auditLogs(teamId, page),
    queryFn: () => adminService.getAuditLogs(teamId, page),
    enabled: !!teamId,
    placeholderData: keepPreviousData,
  });

const useInvalidateTeam = () => {
  const queryClient = useQueryClient();
  return (teamId: string) => {
    queryClient.invalidateQueries({ queryKey: adminKeys.team(teamId) });
    queryClient.invalidateQueries({ queryKey: adminKeys.teams() });
    queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
  };
};

export const useUpdateMemberRole = () => {
  const invalidateTeam = useInvalidateTeam();
  return useMutation({
    mutationFn: ({
      teamId,
      userId,
      role,
    }: {
      teamId: string;
      userId: string;
      role: TeamRole;
    }) => adminService.updateMemberRole(teamId, userId, role),
    onSuccess: (_, { teamId }) => invalidateTeam(teamId),
  });
};

export const useTransferOwnership = () => {
  const invalidateTeam = useInvalidateTeam();
  return useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      adminService.transferOwnership(teamId, userId),
    onSuccess: (_, { teamId }) => invalidateTeam(teamId),
  });
};

export const useVerifyDomain = () => {
  const invalidateTeam = useInvalidateTeam();
  return useMutation({
    mutationFn: (teamId: string) => adminService.verifyDomain(teamId),
    onSuccess: (_, teamId) => invalidateTeam(teamId),
  });
};

export const useAdminRemoveMember = () => {
  const invalidateTeam = useInvalidateTeam();
  return useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      adminService.removeMember(teamId, userId),
    onSuccess: (_, { teamId }) => invalidateTeam(teamId),
  });
};

export const useRevokeInvite = () => {
  const invalidateTeam = useInvalidateTeam();
  return useMutation({
    mutationFn: ({ teamId, inviteId }: { teamId: string; inviteId: string }) =>
      adminService.revokeInvite(teamId, inviteId),
    onSuccess: (_, { teamId }) => invalidateTeam(teamId),
  });
};

export const useBulkInvite = () => {
  const invalidateTeam = useInvalidateTeam();
  return useMutation({
    mutationFn: ({
      teamId,
      emails,
      role,
    }: {
      teamId: string;
      emails: string[];
      role: TeamRole;
    }) => adminService.bulkInvite(teamId, emails, role),
    onSuccess: (_, { teamId }) => invalidateTeam(teamId),
  });
};

export const useUpdateTeamSettings = () => {
  const invalidateTeam = useInvalidateTeam();
  return useMutation({
    mutationFn: ({
      teamId,
      settings,
    }: {
      teamId: string;
      settings: TeamSettingsData;
    }) => adminService.updateSettings(teamId, settings),
    onSuccess: (_, { teamId }) => invalidateTeam(teamId),
  });
};
