import { useMutation, useQuery } from '@tanstack/react-query';
import { billingService } from '../services/billing.service';
import { CreateSubscriptionData } from '../types/subscription';

export const billingKeys = {
  summary: (teamId: string) => ['billing', teamId] as const,
};

export const useBillingSummary = (teamId: string | null) =>
  useQuery({
    queryKey: billingKeys.summary(teamId ?? ''),
    queryFn: () => billingService.getSummary(teamId as string),
    enabled: !!teamId,
    staleTime: 30_000,
  });

// Both redirect to Stripe-hosted pages on success.
export const useStartCheckout = () =>
  useMutation({
    mutationFn: (payload: CreateSubscriptionData) =>
      billingService.startCheckout(payload),
    onSuccess: (url) => {
      window.location.href = url;
    },
  });

export const useOpenBillingPortal = () =>
  useMutation({
    mutationFn: (teamId: string) => billingService.openPortal(teamId),
    onSuccess: (url) => {
      window.location.href = url;
    },
  });
