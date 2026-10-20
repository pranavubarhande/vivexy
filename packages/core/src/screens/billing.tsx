'use client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@vivexy/ui/card';
import { Button } from '@vivexy/ui/button';
import { Badge } from '@vivexy/ui/badge';
import { Skeleton } from '@vivexy/ui/skeleton';
import { EmptyState, PageContainer, PageHeader } from '@vivexy/ui/page-header';
import { cn } from '@vivexy/ui/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vivexy/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vivexy/ui/select';
import {
  Building,
  Check,
  CreditCard,
  Crown,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { plans, type PlanConfig } from '@vivexy/core/configs/billing';
import { useActiveTeam } from '@vivexy/core/hooks/useActiveTeam';
import { useAdministeredTeams } from '@vivexy/core/hooks/useAdmin';
import {
  useBillingSummary,
  useOpenBillingPortal,
  useStartCheckout,
} from '@vivexy/core/hooks/useBilling';
import { getApiErrorMessage } from '@vivexy/core/lib/admin-format';
import {
  BillingInvoice,
  Plan,
  TeamSubscription,
} from '@vivexy/core/types/subscription';

const PLAN_ORDER: Plan[] = ['FREE', 'PRO', 'ENTERPRISE'];
const LIVE_STATUSES = ['ACTIVE', 'TRIALING'];

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString() : '—';

const formatAmount = (invoice: BillingInvoice) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: invoice.currency.toUpperCase(),
  }).format(invoice.amount / 100);

const PlanCard = ({
  plan,
  isCurrent,
  canPurchase,
  isPending,
  onSelect,
}: {
  plan: Plan;
  isCurrent: boolean;
  canPurchase: boolean;
  isPending: boolean;
  onSelect: (plan: Plan) => void;
}) => {
  const config = plans.find((p) => p.key === plan) as PlanConfig;

  return (
    <Card
      className={cn(
        'relative flex flex-col p-6',
        isCurrent &&
          'border-transparent bg-night text-white shadow-xl ring-1 ring-night'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {plan === 'ENTERPRISE' && <Crown className="h-4 w-4" />}
          {plan === 'PRO' && <Zap className="h-4 w-4" />}
          {plan === 'FREE' && <Building className="h-4 w-4" />}
          <span className="font-medium">{config.name}</span>
        </div>
        {isCurrent && <Badge variant="lime">Current plan</Badge>}
      </div>
      <div className="mt-6 flex items-baseline gap-1">
        <span
          className={cn(
            'font-serif text-5xl tracking-tight',
            isCurrent && 'text-lime'
          )}
        >
          ${config.priceMonthly}
        </span>
        <span
          className={cn(
            'text-sm',
            isCurrent ? 'text-white/60' : 'text-muted-foreground'
          )}
        >
          /month
        </span>
      </div>
      <ul className="mt-6 mb-8 space-y-2.5">
        {config.features.map((feature) => (
          <li key={feature} className="flex items-center gap-2.5 text-sm">
            <span
              className={cn(
                'flex size-4 items-center justify-center rounded-full',
                isCurrent ? 'bg-lime text-lime-foreground' : 'bg-muted'
              )}
            >
              <Check className="size-3" />
            </span>
            {feature}
          </li>
        ))}
      </ul>
      {plan !== 'FREE' && (
        <Button
          onClick={() => onSelect(plan)}
          disabled={isCurrent || !canPurchase || isPending}
          className="mt-auto w-full"
          variant={isCurrent ? 'secondary' : 'outline'}
        >
          {isCurrent ? 'Your current plan' : `Choose ${config.name}`}
        </Button>
      )}
    </Card>
  );
};

const SubscriptionDetails = ({
  subscription,
}: {
  subscription: TeamSubscription | null;
}) => {
  if (!subscription) {
    return (
      <p className="text-sm text-muted-foreground">
        This team is on the Free plan.
      </p>
    );
  }
  const isLive = LIVE_STATUSES.includes(subscription.status);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <div className="text-muted-foreground">Plan</div>
          <div className="font-medium">{subscription.plan}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Status</div>
          <Badge variant={isLive ? 'success' : 'secondary'}>
            {subscription.status}
          </Badge>
        </div>
        <div>
          <div className="text-muted-foreground">
            {subscription.cancelAtPeriodEnd ? 'Ends on' : 'Renews on'}
          </div>
          <div className="font-medium">
            {formatDate(subscription.currentPeriodEnd)}
          </div>
        </div>
      </div>
      {subscription.isManual && (
        <p className="text-sm text-muted-foreground">
          This plan was arranged with our team rather than billed by card.
          Contact support to change it.
        </p>
      )}
      {subscription.cancelAtPeriodEnd && (
        <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
          The subscription will cancel at the end of the current billing period.
        </p>
      )}
    </div>
  );
};

const InvoiceTable = ({ invoices }: { invoices: BillingInvoice[] }) => {
  if (!invoices.length) {
    return <p className="text-sm text-muted-foreground">No invoices yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Invoice</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell className="whitespace-nowrap">
                {formatDate(invoice.createdAt)}
              </TableCell>
              <TableCell>{invoice.plan ?? '—'}</TableCell>
              <TableCell className="tabular-nums">
                {formatAmount(invoice)}
              </TableCell>
              <TableCell>
                <Badge
                  variant={invoice.status === 'PAID' ? 'success' : 'secondary'}
                >
                  {invoice.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {invoice.hostedInvoiceUrl || invoice.invoicePdf ? (
                  <Button variant="ghost" size="sm" asChild>
                    <a
                      href={
                        invoice.hostedInvoiceUrl ?? invoice.invoicePdf ?? ''
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View
                      <ExternalLink />
                    </a>
                  </Button>
                ) : (
                  '—'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const BillingContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeTeamId } = useActiveTeam();
  const { data: teams, isLoading: teamsLoading } = useAdministeredTeams();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const teamId =
    selectedTeamId ??
    (teams?.some((team) => team.id === activeTeamId)
      ? activeTeamId
      : (teams?.[0]?.id ?? null));

  const { data: summary, isLoading, refetch } = useBillingSummary(teamId);
  const startCheckout = useStartCheckout();
  const openPortal = useOpenBillingPortal();

  const checkoutResult = searchParams.get('checkout');
  useEffect(() => {
    if (!checkoutResult) return;
    if (checkoutResult === 'success') {
      // The webhook may land a moment after the redirect.
      toast.success('Payment received — your plan will update shortly');
      const timer = setTimeout(() => refetch(), 3000);
      router.replace('/billing', { scroll: false });
      return () => clearTimeout(timer);
    }
    toast.message('Checkout cancelled');
    router.replace('/billing', { scroll: false });
  }, [checkoutResult, refetch, router]);

  const handleSelectPlan = (plan: Plan) => {
    if (!teamId || plan === 'FREE') return;
    startCheckout.mutate(
      { teamId, plan },
      {
        onError: (error) =>
          toast.error(getApiErrorMessage(error, 'Unable to start checkout')),
      }
    );
  };

  const handleManage = () => {
    if (!teamId) return;
    openPortal.mutate(teamId, {
      onError: (error) =>
        toast.error(getApiErrorMessage(error, 'Unable to open billing')),
    });
  };

  if (!teamsLoading && !teams?.length) {
    return (
      <EmptyState
        icon={<CreditCard />}
        title="Billing is managed by team admins"
        description="Plans are billed per team. Ask your team's owner or an admin to manage billing."
      />
    );
  }

  const subscription = summary?.subscription ?? null;
  const hasLivePlan =
    !!subscription && LIVE_STATUSES.includes(subscription.status);
  const currentPlan: Plan = hasLivePlan ? subscription.plan : 'FREE';
  const hasStripePlan = hasLivePlan && !subscription.isManual;
  // A manual comp/trial can be replaced by a paid plan; a card-billed one is
  // changed through the Stripe portal instead.
  const canPurchase = (plan: Plan) =>
    !!summary?.billingConfigured &&
    !hasStripePlan &&
    summary.purchasablePlans.includes(plan);

  return (
    <div className="space-y-8">
      {teams && teams.length > 1 && (
        <div className="max-w-xs">
          <Select
            value={teamId ?? undefined}
            onValueChange={(value) => setSelectedTeamId(value)}
          >
            <SelectTrigger aria-label="Team">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {summary && !summary.billingConfigured && (
        <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
          Online payments aren&apos;t set up yet. Contact support to change your
          plan.
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Current subscription</CardTitle>
            <CardDescription>
              {summary ? `Billing for ${summary.teamName}` : 'Loading…'}
            </CardDescription>
          </div>
          {summary?.hasBillingAccount && summary.billingConfigured && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleManage}
              disabled={openPortal.isPending}
            >
              <CreditCard />
              Manage billing
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading || !summary ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <SubscriptionDetails subscription={subscription} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((plan) => (
          <PlanCard
            key={plan}
            plan={plan}
            isCurrent={plan === currentPlan}
            canPurchase={canPurchase(plan)}
            isPending={startCheckout.isPending}
            onSelect={handleSelectPlan}
          />
        ))}
      </div>
      {hasStripePlan && (
        <p className="text-sm text-muted-foreground">
          To switch plans or cancel, use Manage billing.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Billing history</CardTitle>
          <CardDescription>Invoices for this team</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || !summary ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <InvoiceTable invoices={summary.invoices} />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default function BillingPage() {
  return (
    <PageContainer className="space-y-8">
      <PageHeader
        className="mb-0"
        eyebrow="Billing"
        title="Plans & billing"
        description="Manage your team's subscription, payment method and invoices."
      />
      <Suspense>
        <BillingContent />
      </Suspense>
    </PageContainer>
  );
}
