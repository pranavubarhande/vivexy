import { StocksService } from '@/services/stocks.service';
import { Stock } from '@prisma/client';
import { useQuery } from '@tanstack/react-query';

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

export const useStocks = (
  query?: string,
  page: number = 1,
  limit: number = 50
) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stocks', query, page, limit],
    queryFn: () => StocksService.searchStocks({ query, page, limit }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    stocks: data?.stocks || [],
    pagination: data?.pagination,
    isLoading,
    error,
    refetch,
  };
};
