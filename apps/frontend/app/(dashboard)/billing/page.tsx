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
import { PageContainer, PageHeader } from '@vivexy/ui/page-header';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@vivexy/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@vivexy/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vivexy/ui/select';
import {
  CreditCard,
  Download,
  MoreHorizontal,
  Calendar,
  DollarSign,
  Check,
  CheckCircle,
  XCircle,
  Clock,
  Crown,
  Zap,
  Building,
} from 'lucide-react';
import { useState } from 'react';
import { plans, type PlanConfig } from '@vivexy/core/configs/billing';
import { toast } from 'sonner';
import axiosInstance from '@vivexy/core/services/axiosInstance.service';
import { Invoice, Plan, Subscription } from '@vivexy/core/types/subscription';

// Mock data for demonstration - in real app, this would come from API
const mockSubscription: Subscription = {
  id: 'sub_1',
  userId: 'user_1',
  teamId: null,
  stripeSubscriptionId: 'sub_stripe_123',
  stripeCustomerId: 'cus_stripe_456',
  status: 'ACTIVE',
  plan: 'PRO',
  currentPeriodStart: new Date('2024-01-01'),
  currentPeriodEnd: new Date('2024-02-01'),
  cancelAtPeriodEnd: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockInvoices: Invoice[] = [
  {
    id: 'inv_1',
    userId: 'user_1',
    subscriptionId: 'sub_1',
    stripeInvoiceId: 'in_stripe_123',
    amount: 2900,
    currency: 'USD',
    status: 'PAID',
    invoicePdf: null,
    hostedInvoiceUrl: 'https://stripe.com/invoice/123',
    createdAt: new Date('2024-01-01'),
    user: {
      id: 'user_1',
      email: 'user@example.com',
      name: 'John Doe',
      role: 'USER' as const,
      avatar: null,
      password: '', // Mock required field
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
  },
  {
    id: 'inv_2',
    userId: 'user_1',
    subscriptionId: 'sub_1',
    stripeInvoiceId: 'in_stripe_456',
    amount: 2900,
    currency: 'USD',
    status: 'PAID',
    invoicePdf: null,
    hostedInvoiceUrl: 'https://stripe.com/invoice/456',
    createdAt: new Date('2023-12-01'),
    user: {
      id: 'user_1',
      email: 'user@example.com',
      name: 'John Doe',
      role: 'USER' as const,
      avatar: null,
      password: '', // Mock required field
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
  },
];

const PlanCard = ({
  plan,
  currentPlan,
  onSelect,
}: {
  plan: Plan;
  currentPlan: Plan;
  onSelect: (plan: Plan) => void;
}) => {
  const isCurrent = plan === currentPlan;
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
        {config.features.map((feature, index) => (
          <li key={index} className="flex items-center gap-2.5 text-sm">
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
      <Button
        onClick={() => onSelect(plan)}
        disabled={isCurrent}
        className="mt-auto w-full"
        variant={isCurrent ? 'secondary' : 'outline'}
      >
        {isCurrent ? 'Your current plan' : `Choose ${config.name}`}
      </Button>
    </Card>
  );
};

const SubscriptionStatus = ({
  subscription,
}: {
  subscription: Subscription;
}) => {
  const getStatusIcon = () => {
    switch (subscription.status) {
      case 'ACTIVE':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'PAST_DUE':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'CANCELED':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="font-medium">Current Subscription</span>
        </div>
        <Badge
          variant={subscription.status === 'ACTIVE' ? 'success' : 'secondary'}
        >
          {subscription.status}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground">Plan</div>
          <div className="font-medium">{subscription.plan}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Next Billing</div>
          <div className="font-medium">
            {subscription.currentPeriodEnd
              ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
              : 'N/A'}
          </div>
        </div>
      </div>

      {subscription.cancelAtPeriodEnd && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            Your subscription will be canceled at the end of the current billing
            period.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm">
          <CreditCard className="mr-2 h-4 w-4" />
          Update Payment Method
        </Button>
        <Button variant="outline" size="sm">
          View Details
        </Button>
      </div>
    </div>
  );
};

const InvoiceActions = ({ invoice }: { invoice: Invoice }) => {
  const handleDownload = () => {
    if (invoice.hostedInvoiceUrl) {
      window.open(invoice.hostedInvoiceUrl, '_blank');
    } else {
      toast.error('Invoice not available for download');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={handleDownload}>
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownload}>
          View Online
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ChangePlanDialog = () => {
  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan>('PRO');

  const handlePlanChange = async () => {
    try {
      // TODO: Implement plan change logic
      toast.success(`Plan changed to ${selectedPlan}`);
      setOpen(false);
    } catch {
      toast.error('Failed to change plan');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Change Plan</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Change Subscription Plan</DialogTitle>
          <DialogDescription>
            Select a new plan for your subscription.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Select
            value={selectedPlan}
            onValueChange={(value: Plan) => setSelectedPlan(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FREE">Free - $0/month</SelectItem>
              <SelectItem value="PRO">Pro - $29/month</SelectItem>
              <SelectItem value="ENTERPRISE">Enterprise - $99/month</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={handlePlanChange}>Change Plan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function BillingPage() {
  const handleSelectPlan = async (planKey: Plan) => {
    try {
      const cfg = plans.find((p) => p.key === planKey);
      if (!cfg) return;
      if (cfg.paymentLink) {
        window.open(cfg.paymentLink, '_blank');
        return;
      }
      if (cfg.priceId) {
        const { data } = await axiosInstance.post('/stripe/checkout', {
          priceId: cfg.priceId,
          mode: 'subscription',
        });
        if (data.url) {
          window.location.href = data.url;
        } else {
          toast.error('Checkout session URL not found');
        }
        return;
      }
      toast.error('No payment method configured for this plan');
    } catch {
      toast.error('Unable to start checkout');
    }
  };
  return (
    <PageContainer className="space-y-8">
      <PageHeader
        className="mb-0"
        eyebrow="Billing"
        title="Plans & billing"
        description="Manage your subscription, payment method and invoices."
        actions={<ChangePlanDialog />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Current subscription</CardTitle>
          <CardDescription>Your active subscription details</CardDescription>
        </CardHeader>
        <CardContent>
          <SubscriptionStatus subscription={mockSubscription} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {(['FREE', 'PRO', 'ENTERPRISE'] as Plan[]).map((p) => (
          <PlanCard
            key={p}
            plan={p}
            currentPlan={mockSubscription.plan}
            onSelect={handleSelectPlan}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Billing history</CardTitle>
          <CardDescription>
            Your past invoices and payment history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {new Date(invoice.createdAt).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">
                        {invoice.subscription?.plan} Plan
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(invoice.createdAt).getFullYear()}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />$
                      {(invoice.amount / 100).toFixed(2)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        invoice.status === 'PAID' ? 'success' : 'secondary'
                      }
                    >
                      {invoice.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <InvoiceActions invoice={invoice} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
