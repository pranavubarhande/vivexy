import axiosInstance from './axiosInstance.service';
import {
  Project,
  ProjectWithChats,
  ProjectMember,
  ProjectTeam,
  CreateProjectData,
  UpdateProjectData,
} from '@/types/project';
import { Chat } from '@/types/chat';

export const projectsService = {
  getProjects: async (): Promise<Project[]> => {
    const response = await axiosInstance.get<{ projects: Project[] }>(
      '/projects'
    );
    return response.data.projects;
  },

  getProject: async (projectId: string): Promise<ProjectWithChats> => {
    const response = await axiosInstance.get<{ project: ProjectWithChats }>(
      `/projects/${projectId}`
    );
    return response.data.project;
  },

  createProject: async (data: CreateProjectData): Promise<Project> => {
    const response = await axiosInstance.post<{ project: Project }>(
      '/projects',
      data
    );
    return response.data.project;
  },

  updateProject: async (
    projectId: string,
    data: UpdateProjectData
  ): Promise<Project> => {
    const response = await axiosInstance.patch<{ project: Project }>(
      `/projects/${projectId}`,
      data
    );
    return response.data.project;
  },

  deleteProject: async (projectId: string): Promise<void> => {
    await axiosInstance.delete(`/projects/${projectId}`);
  },

  // Chats
  getProjectChats: async (projectId: string): Promise<Chat[]> => {
    const response = await axiosInstance.get<{ chats: Chat[] }>(
      `/projects/${projectId}/chats`
    );
    return response.data.chats;
  },

  addChatToProject: async (
    projectId: string,
    chatId: string
  ): Promise<void> => {
    await axiosInstance.post(`/projects/${projectId}/chats`, { chatId });
  },

  removeChatFromProject: async (
    projectId: string,
    chatId: string
  ): Promise<void> => {
    await axiosInstance.delete(`/projects/${projectId}/chats/${chatId}`);
  },

  // Members
  getProjectMembers: async (projectId: string): Promise<ProjectMember[]> => {
    const response = await axiosInstance.get<{ members: ProjectMember[] }>(
      `/projects/${projectId}/members`
    );
    return response.data.members;
  },

  // Team sharing
  getProjectTeams: async (projectId: string): Promise<ProjectTeam[]> => {
    const response = await axiosInstance.get<{ teams: ProjectTeam[] }>(
      `/projects/${projectId}/teams`
    );
    return response.data.teams;
  },

  shareWithTeam: async (projectId: string, teamId: string): Promise<void> => {
    await axiosInstance.post(`/projects/${projectId}/teams`, { teamId });
  },

  revokeTeamAccess: async (
    projectId: string,
    teamId: string
  ): Promise<void> => {
    await axiosInstance.delete(`/projects/${projectId}/teams/${teamId}`);
  },

  getUnassignedChats: async (): Promise<import('@/types/chat').Chat[]> => {
    const response = await axiosInstance.get<{
      chats: import('@/types/chat').Chat[];
    }>('/projects/unassigned-chats');
    return response.data.chats;
  },
};
