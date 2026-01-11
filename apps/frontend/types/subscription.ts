import { Team } from '@/types/team';
import { User } from '@/types/user';

export interface Subscription {
  id: string;
  userId: string | null;
  teamId: string | null;
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  status: SubscriptionStatus;
  plan: Plan;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
  user?: User | null;
  team?: Team | null;
}

export interface Invoice {
  id: string;
  userId: string;
  subscriptionId: string | null;
  stripeInvoiceId: string | null;
  amount: number;
  currency: string;
  status: string;
  invoicePdf: string | null;
  hostedInvoiceUrl: string | null;
  createdAt: Date;
  user: User;
  subscription?: Subscription | null;
}

export type SubscriptionStatus =
  | 'INACTIVE'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'UNPAID'
  | 'TRIALING';
export type Plan = 'FREE' | 'PRO' | 'ENTERPRISE';

export interface CreateSubscriptionData {
  priceId: string;
  teamId?: string;
}

export interface UpdateSubscriptionData {
  cancelAtPeriodEnd?: boolean;
}
