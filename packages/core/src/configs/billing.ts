import { Plan } from '@vivexy/core/types/subscription';

export type PlanConfig = {
  key: Plan;
  name: string;
  priceMonthly: number;
  features: string[];
};

export const plans: PlanConfig[] = [
  {
    key: 'FREE',
    name: 'Free',
    priceMonthly: 0,
    features: ['1 Team', 'Basic Support', 'Limited Features'],
  },
  {
    key: 'PRO',
    name: 'Pro',
    priceMonthly: Number(process.env.NEXT_PUBLIC_PRO_PRICE_USD || 29),
    features: [
      'Unlimited Teams',
      'Priority Support',
      'Advanced Features',
      'API Access',
    ],
  },
  {
    key: 'ENTERPRISE',
    name: 'Enterprise',
    priceMonthly: Number(process.env.NEXT_PUBLIC_ENTERPRISE_PRICE_USD || 99),
    features: [
      'Everything in Pro',
      'Dedicated Support',
      'Custom Integrations',
      'SLA Guarantee',
    ],
  },
];
