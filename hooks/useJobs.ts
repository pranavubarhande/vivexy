import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  JobsService,
  CreateJobData,
  UpdateJobData,
} from '@/services/jobs.service';

export const useJobs = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => JobsService.getJobs(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  return {
    jobs: data,
    isLoading,
    error,
    refetch,
  };
};

export const useJob = (jobId: string) => {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => JobsService.getJob(jobId),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

export const useCreateJob = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateJobData) => JobsService.createJob(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
};

export const useUpdateJob = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateJobData }) =>
      JobsService.updateJob(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
};

export const useDeleteJob = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => JobsService.deleteJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
};
