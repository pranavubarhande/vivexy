import axiosInstance from './axiosInstance.service';
import type {
  CreateScheduledTaskPayload,
  ScheduledTask,
  ScheduledTaskRun,
  UpdateScheduledTaskPayload,
} from '../types/scheduled-task';

export const scheduledTasksService = {
  list: async (): Promise<ScheduledTask[]> => {
    const res = await axiosInstance.get<ScheduledTask[]>('/scheduled-tasks');
    return res.data;
  },

  get: async (id: string): Promise<ScheduledTask> => {
    const res = await axiosInstance.get<ScheduledTask>(
      `/scheduled-tasks/${id}`
    );
    return res.data;
  },

  create: async (
    payload: CreateScheduledTaskPayload
  ): Promise<ScheduledTask> => {
    const res = await axiosInstance.post<ScheduledTask>(
      '/scheduled-tasks',
      payload
    );
    return res.data;
  },

  update: async (
    id: string,
    payload: UpdateScheduledTaskPayload
  ): Promise<ScheduledTask> => {
    const res = await axiosInstance.put<ScheduledTask>(
      `/scheduled-tasks/${id}`,
      payload
    );
    return res.data;
  },

  delete: async (id: string): Promise<void> => {
    await axiosInstance.delete(`/scheduled-tasks/${id}`);
  },

  runNow: async (id: string): Promise<ScheduledTaskRun> => {
    const res = await axiosInstance.post<ScheduledTaskRun>(
      `/scheduled-tasks/${id}/run`
    );
    return res.data;
  },

  getRuns: async (id: string): Promise<ScheduledTaskRun[]> => {
    const res = await axiosInstance.get<ScheduledTaskRun[]>(
      `/scheduled-tasks/${id}/runs`
    );
    return res.data;
  },
};
