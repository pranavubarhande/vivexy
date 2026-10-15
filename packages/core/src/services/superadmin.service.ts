import axiosInstance from './axiosInstance.service';
import {
  AuditLogEntry,
  ClientDetail,
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

  getAuditLogs: async (page: number): Promise<Paginated<AuditLogEntry>> => {
    const { data } = await axiosInstance.get<Paginated<AuditLogEntry>>(
      '/superadmin/audit-logs',
      { params: { page, pageSize: 25 } }
    );
    return data;
  },
};
