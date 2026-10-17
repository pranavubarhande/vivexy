import { Team } from './team';
import { User } from './user';

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
  plan: Exclude<Plan, 'FREE'>;
  teamId: string;
}

export interface TeamSubscription {
  id: string;
  teamId: string | null;
  plan: Plan;
  status: SubscriptionStatus;
  isManual: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingInvoice {
  id: string;
  amount: number; // cents
  currency: string;
  status: string;
  plan: Plan | null;
  invoicePdf: string | null;
  hostedInvoiceUrl: string | null;
  createdAt: string | null;
}

export interface BillingSummary {
  teamId: string;
  teamName: string;
  viewerRole: 'OWNER' | 'ADMIN';
  billingConfigured: boolean;
  hasBillingAccount: boolean;
  purchasablePlans: Plan[];
  subscription: TeamSubscription | null;
  invoices: BillingInvoice[];
}

export interface UpdateSubscriptionData {
  cancelAtPeriodEnd?: boolean;
}
