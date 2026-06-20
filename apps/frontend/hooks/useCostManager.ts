import { useQuery } from '@tanstack/react-query';
import { costService } from '@/services/cost.service';

const costKeys = {
  summary: (days: number) => ['cost', 'summary', days] as const,
  byModel: (days: number) => ['cost', 'by-model', days] as const,
  daily: (days: number) => ['cost', 'daily', days] as const,
  recent: (limit: number) => ['cost', 'recent', limit] as const,
};

export function useCostSummary(days = 30) {
  return useQuery({
    queryKey: costKeys.summary(days),
    queryFn: () => costService.getSummary(days),
    staleTime: 60_000,
  });
}

export function useCostByModel(days = 30) {
  return useQuery({
    queryKey: costKeys.byModel(days),
    queryFn: () => costService.getByModel(days),
    staleTime: 60_000,
  });
}

export function useDailyUsage(days = 30) {
  return useQuery({
    queryKey: costKeys.daily(days),
    queryFn: () => costService.getDaily(days),
    staleTime: 60_000,
  });
}

export function useRecentUsage(limit = 50) {
  return useQuery({
    queryKey: costKeys.recent(limit),
    queryFn: () => costService.getRecent(limit),
    staleTime: 60_000,
  });
}
