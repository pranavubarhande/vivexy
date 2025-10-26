'use client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CreditCard,
  Download,
  MoreHorizontal,
  Calendar,
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  Crown,
  Zap,
  Building,
} from 'lucide-react';
import { useState } from 'react';
import { plans, type PlanConfig } from '@/configs/billing';
import { toast } from 'sonner';
import axiosInstance from '@/services/axiosInstance.service';
import { Invoice, Plan, Subscription } from '@/types/subscription';

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
    <Card className={`relative ${isCurrent ? 'border-primary' : ''}`}>
      {isCurrent && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary">Current Plan</Badge>
        </div>
      )}
      <CardHeader>
        <div className="flex items-center gap-2">
          {plan === 'ENTERPRISE' && (
            <Crown className="h-5 w-5 text-yellow-500" />
          )}
          {plan === 'PRO' && <Zap className="h-5 w-5 text-blue-500" />}
          {plan === 'FREE' && <Building className="h-5 w-5 text-gray-500" />}
          <CardTitle className="text-lg">{config.name}</CardTitle>
        </div>
        <div className="text-3xl font-bold">
          ${config.priceMonthly}
          <span className="text-sm font-normal text-muted-foreground">
            /month
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 mb-4">
          {config.features.map((feature, index) => (
            <li key={index} className="flex items-center gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {feature}
            </li>
          ))}
        </ul>
        <Button
          onClick={() => onSelect(plan)}
          disabled={isCurrent}
          className="w-full"
          variant={isCurrent ? 'outline' : 'default'}
        >
          {isCurrent ? 'Current Plan' : `Choose ${config.name}`}
        </Button>
      </CardContent>
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

  const getStatusColor = () => {
    switch (subscription.status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'PAST_DUE':
        return 'bg-red-100 text-red-800';
      case 'CANCELED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="font-medium">Current Subscription</span>
        </div>
        <Badge className={getStatusColor()}>{subscription.status}</Badge>
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">
            Manage your subscription and billing information.
          </p>
        </div>
        <ChangePlanDialog />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current Subscription</CardTitle>
            <CardDescription>Your active subscription details</CardDescription>
          </CardHeader>
          <CardContent>
            <SubscriptionStatus subscription={mockSubscription} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Available Plans</CardTitle>
            <CardDescription>
              Choose the plan that best fits your needs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(['FREE', 'PRO', 'ENTERPRISE'] as Plan[]).map((p) => (
                <PlanCard
                  key={p}
                  plan={p}
                  currentPlan={mockSubscription.plan}
                  onSelect={handleSelectPlan}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
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
                        invoice.status === 'PAID' ? 'default' : 'secondary'
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
    </div>
  );
}
