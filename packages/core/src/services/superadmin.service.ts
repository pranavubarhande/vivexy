import axiosInstance from './axiosInstance.service';
import {
  AdminLLMModel,
  Announcement,
  AnnouncementData,
  AuditLogEntry,
  ClientDetail,
  ClientPlanData,
  ImpersonationResult,
  LLMModelUpdateData,
  PlatformHealth,
  ClientSummary,
  ClientUpdateData,
  ListQuery,
  Paginated,
  PlatformOverview,
  PlatformUsage,
  PlatformUser,
  PlatformUserDetail,
  PlatformUserUpdateData,
  UserListQuery,
} from '../types/admin';

export const superadminService = {
  getOverview: async (): Promise<PlatformOverview> => {
    const { data } = await axiosInstance.get<PlatformOverview>(
      '/superadmin/overview'
    );
    return data;
  },

  getUsage: async (days: number): Promise<PlatformUsage> => {
    const { data } = await axiosInstance.get<PlatformUsage>(
      '/superadmin/usage',
      { params: { days } }
    );
    return data;
  },

  getClients: async (query: ListQuery): Promise<Paginated<ClientSummary>> => {
    const { data } = await axiosInstance.get<Paginated<ClientSummary>>(
      '/superadmin/clients',
      { params: query }
    );
    return data;
  },

  getClient: async (teamId: string): Promise<ClientDetail> => {
    const { data } = await axiosInstance.get<ClientDetail>(
      `/superadmin/clients/${teamId}`
    );
    return data;
  },

  updateClient: async (
    teamId: string,
    update: ClientUpdateData
  ): Promise<ClientDetail> => {
    const { data } = await axiosInstance.patch<ClientDetail>(
      `/superadmin/clients/${teamId}`,
      update
    );
    return data;
  },

  getUsers: async (query: UserListQuery): Promise<Paginated<PlatformUser>> => {
    const { data } = await axiosInstance.get<Paginated<PlatformUser>>(
      '/superadmin/users',
      { params: query }
    );
    return data;
  },

  getUser: async (userId: string): Promise<PlatformUserDetail> => {
    const { data } = await axiosInstance.get<PlatformUserDetail>(
      `/superadmin/users/${userId}`
    );
    return data;
  },

  updateUser: async (
    userId: string,
    update: PlatformUserUpdateData
  ): Promise<PlatformUserDetail> => {
    const { data } = await axiosInstance.patch<PlatformUserDetail>(
      `/superadmin/users/${userId}`,
      update
    );
    return data;
  },

  setClientPlan: async (
    teamId: string,
    planData: ClientPlanData
  ): Promise<ClientDetail> => {
    const { data } = await axiosInstance.put<ClientDetail>(
      `/superadmin/clients/${teamId}/plan`,
      planData
    );
    return data;
  },

  impersonate: async (userId: string): Promise<ImpersonationResult> => {
    const { data } = await axiosInstance.post<ImpersonationResult>(
      `/superadmin/users/${userId}/impersonate`
    );
    return data;
  },

  getHealth: async (): Promise<PlatformHealth> => {
    const { data } =
      await axiosInstance.get<PlatformHealth>('/superadmin/health');
    return data;
  },

  getModels: async (): Promise<AdminLLMModel[]> => {
    const { data } = await axiosInstance.get<{ models: AdminLLMModel[] }>(
      '/superadmin/models'
    );
    return data.models;
  },

  updateModel: async (
    modelId: string,
    update: LLMModelUpdateData
  ): Promise<AdminLLMModel> => {
    const { data } = await axiosInstance.patch<AdminLLMModel>(
      `/superadmin/models/${modelId}`,
      update
    );
    return data;
  },

  getAnnouncements: async (): Promise<Announcement[]> => {
    const { data } = await axiosInstance.get<{ announcements: Announcement[] }>(
      '/superadmin/announcements'
    );
    return data.announcements;
  },

  createAnnouncement: async (
    announcement: AnnouncementData
  ): Promise<Announcement> => {
    const { data } = await axiosInstance.post<Announcement>(
      '/superadmin/announcements',
      announcement
    );
    return data;
  },

  updateAnnouncement: async (
    announcementId: string,
    announcement: AnnouncementData
  ): Promise<Announcement> => {
    const { data } = await axiosInstance.patch<Announcement>(
      `/superadmin/announcements/${announcementId}`,
      announcement
    );
    return data;
  },

  deleteAnnouncement: async (announcementId: string): Promise<void> => {
    await axiosInstance.delete(`/superadmin/announcements/${announcementId}`);
  },

  getAuditLogs: async (page: number): Promise<Paginated<AuditLogEntry>> => {
    const { data } = await axiosInstance.get<Paginated<AuditLogEntry>>(
      '/superadmin/audit-logs',
      { params: { page, pageSize: 25 } }
    );
    return data;
  },
};
