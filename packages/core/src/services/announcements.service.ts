import axiosInstance from './axiosInstance.service';
import { Announcement } from '../types/admin';

export const announcementsService = {
  getActive: async (): Promise<Announcement[]> => {
    const { data } = await axiosInstance.get<{ announcements: Announcement[] }>(
      '/announcements'
    );
    return data.announcements;
  },
};
