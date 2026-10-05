import { Plan } from '@vivexy/core/types/subscription';

export type PlanConfig = {
  key: Plan;
  name: string;
  priceMonthly: number;
  features: string[];
  // If provided, open this payment link directly
  paymentLink?: string;
  // If provided (and paymentLink missing), create a Checkout Session
  priceId?: string;
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
    paymentLink: process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_PRO,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PRO,
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
    paymentLink: process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_ENTERPRISE,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ENTERPRISE,
  },
];
