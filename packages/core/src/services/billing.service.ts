import axiosInstance from './axiosInstance.service';
import { BillingSummary, CreateSubscriptionData } from '../types/subscription';

export const billingService = {
  getSummary: async (teamId: string): Promise<BillingSummary> => {
    const { data } = await axiosInstance.get<BillingSummary>(
      '/stripe/subscription',
      { params: { teamId } }
    );
    return data;
  },

  startCheckout: async (payload: CreateSubscriptionData): Promise<string> => {
    const { data } = await axiosInstance.post<{ url: string }>(
      '/stripe/checkout',
      payload
    );
    return data.url;
  },

  openPortal: async (teamId: string): Promise<string> => {
    const { data } = await axiosInstance.post<{ url: string }>(
      '/stripe/portal',
      { teamId }
    );
    return data.url;
  },
};
