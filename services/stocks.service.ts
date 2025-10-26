import { Stock } from '@prisma/client';
import axiosInstance from '@/services/axiosInstance.service';

export interface StocksResponse {
  stocks: Stock[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface SearchStocksParams {
  query?: string;
  page?: number;
  limit?: number;
}

export class StocksService {
  static async getStocks(): Promise<Stock[]> {
    const response = await axiosInstance.get('/stocks');
    return response.data.stocks || response.data;
  }

  static async searchStocks(
    params: SearchStocksParams = {}
  ): Promise<StocksResponse> {
    const queryParams = new URLSearchParams();

    if (params.query) queryParams.set('q', params.query);
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.limit) queryParams.set('limit', params.limit.toString());

    const response = await axiosInstance.get(
      `/stocks?${queryParams.toString()}`
    );
    return response.data;
  }

  static async getStock(id: string): Promise<Stock> {
    const response = await axiosInstance.get(`/stocks/${id}`);
    return response.data;
  }
}
