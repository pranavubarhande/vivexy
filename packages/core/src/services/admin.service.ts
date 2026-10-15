import axiosInstance from './axiosInstance.service';
import {
  AdministeredTeam,
  AuditLogEntry,
  BulkInviteResult,
  Paginated,
  TeamAdminOverview,
  TeamInviteSummary,
  TeamMemberWithUsage,
  TeamSettingsData,
} from '../types/admin';
import { TeamRole } from '../types/team';

export const adminService = {
  getTeams: async (): Promise<AdministeredTeam[]> => {
    const { data } = await axiosInstance.get<{ teams: AdministeredTeam[] }>(
      '/admin/teams'
    );
    return data.teams;
  },

  getOverview: async (
    teamId: string,
    days: number
  ): Promise<TeamAdminOverview> => {
    const { data } = await axiosInstance.get<TeamAdminOverview>(
      `/admin/teams/${teamId}/overview`,
      { params: { days } }
    );
    return data;
  },

  getMembers: async (
    teamId: string,
    days: number
  ): Promise<TeamMemberWithUsage[]> => {
    const { data } = await axiosInstance.get<{
      members: TeamMemberWithUsage[];
    }>(`/admin/teams/${teamId}/members`, { params: { days } });
    return data.members;
  },

  updateMemberRole: async (
    teamId: string,
    userId: string,
    role: TeamRole
  ): Promise<void> => {
    await axiosInstance.patch(`/admin/teams/${teamId}/members/${userId}`, {
      role,
    });
  },

  removeMember: async (teamId: string, userId: string): Promise<void> => {
    await axiosInstance.delete(`/admin/teams/${teamId}/members/${userId}`);
  },

  getInvites: async (teamId: string): Promise<TeamInviteSummary[]> => {
    const { data } = await axiosInstance.get<{
      invites: TeamInviteSummary[];
    }>(`/admin/teams/${teamId}/invites`);
    return data.invites;
  },

  revokeInvite: async (teamId: string, inviteId: string): Promise<void> => {
    await axiosInstance.delete(`/admin/teams/${teamId}/invites/${inviteId}`);
  },

  updateSettings: async (
    teamId: string,
    settings: TeamSettingsData
  ): Promise<void> => {
    await axiosInstance.patch(`/admin/teams/${teamId}/settings`, settings);
  },

  bulkInvite: async (
    teamId: string,
    emails: string[],
    role: TeamRole
  ): Promise<BulkInviteResult> => {
    const { data } = await axiosInstance.post<BulkInviteResult>(
      `/admin/teams/${teamId}/invites/bulk`,
      { emails, role }
    );
    return data;
  },

  exportUsageCsv: async (teamId: string, days: number): Promise<Blob> => {
    const { data } = await axiosInstance.get<Blob>(
      `/admin/teams/${teamId}/usage/export`,
      { params: { days }, responseType: 'blob' }
    );
    return data;
  },

  getAuditLogs: async (
    teamId: string,
    page: number
  ): Promise<Paginated<AuditLogEntry>> => {
    const { data } = await axiosInstance.get<Paginated<AuditLogEntry>>(
      `/admin/teams/${teamId}/audit-logs`,
      { params: { page, pageSize: 25 } }
    );
    return data;
  },
};
