import axiosInstance from './axiosInstance.service';
import {
  Team,
  CreateTeamData,
  UpdateTeamData,
  TeamMember,
  InviteMemberData,
} from '@/types/user';

// Teams API calls
export const teamsService = {
  // Get user's teams
  getTeams: async (): Promise<Team[]> => {
    const response = await axiosInstance.get<{ teams: Team[] }>('/teams');
    return response.data.teams;
  },

  // Get specific team
  getTeam: async (teamId: string): Promise<Team> => {
    const response = await axiosInstance.get<{ team: Team }>(
      `/teams/${teamId}`
    );
    return response.data.team;
  },

  // Create team
  createTeam: async (teamData: CreateTeamData): Promise<Team> => {
    const response = await axiosInstance.post<{ team: Team }>(
      '/teams',
      teamData
    );
    return response.data.team;
  },

  // Update team
  updateTeam: async (teamId: string, data: UpdateTeamData): Promise<Team> => {
    const response = await axiosInstance.patch<{ team: Team }>(
      `/teams/${teamId}`,
      data
    );
    return response.data.team;
  },

  // Delete team
  deleteTeam: async (teamId: string): Promise<void> => {
    await axiosInstance.delete(`/teams/${teamId}`);
  },

  // Get team members
  getTeamMembers: async (teamId: string): Promise<TeamMember[]> => {
    const response = await axiosInstance.get<{ members: TeamMember[] }>(
      `/teams/${teamId}/members`
    );
    return response.data.members;
  },

  // Invite member
  inviteMember: async (
    teamId: string,
    data: InviteMemberData
  ): Promise<void> => {
    await axiosInstance.post(`/teams/${teamId}/members`, data);
  },

  // Remove member
  removeMember: async (teamId: string, userId: string): Promise<void> => {
    await axiosInstance.delete(`/teams/${teamId}/members/${userId}`);
  },
};
