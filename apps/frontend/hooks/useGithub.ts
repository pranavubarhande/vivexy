import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { githubService } from '@/services/github.service';
import { toast } from 'sonner';

export const githubKeys = {
  status: ['github', 'status'] as const,
  repos: ['github', 'repos'] as const,
  linkedRepos: ['github', 'linked-repos'] as const,
  repoContents: (fullName: string, path: string, ref?: string) =>
    ['github', 'contents', fullName, path, ref] as const,
  repoCommits: (fullName: string) => ['github', 'commits', fullName] as const,
  repoBranches: (fullName: string) => ['github', 'branches', fullName] as const,
};

export const useGithubStatus = () => {
  return useQuery({
    queryKey: githubKeys.status,
    queryFn: githubService.getStatus,
    staleTime: 60_000,
    retry: false,
  });
};

export const useGithubRepos = (enabled = false) => {
  return useQuery({
    queryKey: githubKeys.repos,
    queryFn: () => githubService.getRepos(),
    enabled,
    staleTime: 30_000,
  });
};

export const useLinkedRepos = () => {
  return useQuery({
    queryKey: githubKeys.linkedRepos,
    queryFn: githubService.getLinkedRepos,
    staleTime: 30_000,
  });
};

export const useRepoCommits = (fullName: string, enabled = false) => {
  return useQuery({
    queryKey: githubKeys.repoCommits(fullName),
    queryFn: () => githubService.getRepoCommits(fullName),
    enabled: enabled && !!fullName,
    staleTime: 60_000,
  });
};

export const useRepoBranches = (fullName: string, enabled = false) => {
  return useQuery({
    queryKey: githubKeys.repoBranches(fullName),
    queryFn: () => githubService.getRepoBranches(fullName),
    enabled: enabled && !!fullName,
    staleTime: 60_000,
  });
};

export const useRepoContents = (
  fullName: string,
  path: string,
  ref?: string,
  enabled = false
) => {
  return useQuery({
    queryKey: githubKeys.repoContents(fullName, path, ref),
    queryFn: () => githubService.getRepoContents(fullName, path, ref),
    enabled: enabled && !!fullName,
    staleTime: 30_000,
  });
};

export const useFileContent = (
  fullName: string,
  filePath: string,
  ref?: string,
  enabled = false
) => {
  return useQuery({
    queryKey: ['github', 'file-content', fullName, filePath, ref],
    queryFn: () => githubService.getFileContent(fullName, filePath, ref),
    enabled: enabled && !!fullName && !!filePath,
    staleTime: 30_000,
  });
};

export const useLinkRepo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fullName: string) => githubService.linkRepo(fullName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: githubKeys.linkedRepos });
      toast.success('Repository linked');
    },
    onError: () => toast.error('Failed to link repository'),
  });
};

export const useUnlinkRepo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fullName: string) => githubService.unlinkRepo(fullName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: githubKeys.linkedRepos });
      toast.success('Repository unlinked');
    },
    onError: () => toast.error('Failed to unlink repository'),
  });
};

export const useGithubDisconnect = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: githubService.disconnect,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: githubKeys.status });
      qc.invalidateQueries({ queryKey: githubKeys.linkedRepos });
      toast.success('GitHub disconnected');
    },
    onError: () => toast.error('Failed to disconnect GitHub'),
  });
};
