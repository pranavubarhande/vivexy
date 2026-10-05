import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsService } from '../services/projects.service';
import { CreateProjectData, UpdateProjectData } from '../types/project';

export const useProjects = () =>
  useQuery({
    queryKey: ['projects'],
    queryFn: projectsService.getProjects,
    staleTime: 5 * 60 * 1000,
  });

export const useProject = (projectId: string) =>
  useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsService.getProject(projectId),
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
  });

export const useCreateProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectData) =>
      projectsService.createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: UpdateProjectData;
    }) => projectsService.updateProject(projectId, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', updated.id] });
    },
  });
};

export const useDeleteProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => projectsService.deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
};

export const useProjectChats = (projectId: string) =>
  useQuery({
    queryKey: ['project-chats', projectId],
    queryFn: () => projectsService.getProjectChats(projectId),
    enabled: !!projectId,
    staleTime: 1 * 60 * 1000,
  });

export const useAddChatToProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      chatId,
    }: {
      projectId: string;
      chatId: string;
    }) => projectsService.addChatToProject(projectId, chatId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-chats', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
};

export const useRemoveChatFromProject = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      chatId,
    }: {
      projectId: string;
      chatId: string;
    }) => projectsService.removeChatFromProject(projectId, chatId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-chats', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
};

export const useProjectMembers = (projectId: string) =>
  useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => projectsService.getProjectMembers(projectId),
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
  });

export const useProjectTeams = (projectId: string) =>
  useQuery({
    queryKey: ['project-teams', projectId],
    queryFn: () => projectsService.getProjectTeams(projectId),
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
  });

export const useShareProjectWithTeam = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      teamId,
    }: {
      projectId: string;
      teamId: string;
    }) => projectsService.shareWithTeam(projectId, teamId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-teams', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
};

export const useUnassignedChats = (enabled: boolean) =>
  useQuery({
    queryKey: ['unassigned-chats'],
    queryFn: projectsService.getUnassignedChats,
    enabled,
    staleTime: 30_000,
  });

export const useRevokeTeamAccess = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      teamId,
    }: {
      projectId: string;
      teamId: string;
    }) => projectsService.revokeTeamAccess(projectId, teamId),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['project-teams', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
};
