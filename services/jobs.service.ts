import { Job } from '@prisma/client';
import axiosInstance from '@/services/axiosInstance.service';

export interface CreateJobData {
  name: string;
  analysisPrompt?: string;
  selectedStocks: string[];
  runAtTime: string;
}

export interface UpdateJobData {
  name?: string;
  analysisPrompt?: string;
  runAtTime?: string;
  isActive?: boolean;
}

export class JobsService {
  static async getJobs(): Promise<Job[]> {
    const response = await axiosInstance.get('/jobs');
    return response.data;
  }

  static async getJob(id: string): Promise<Job> {
    const response = await axiosInstance.get(`/jobs/${id}`);
    return response.data;
  }

  static async createJob(data: CreateJobData): Promise<Job> {
    const response = await axiosInstance.post('/jobs', data);
    return response.data;
  }

  static async updateJob(id: string, data: UpdateJobData): Promise<Job> {
    const response = await axiosInstance.put(`/jobs/${id}`, data);
    return response.data;
  }

  static async deleteJob(id: string): Promise<void> {
    await axiosInstance.delete(`/jobs/${id}`);
  }
}
