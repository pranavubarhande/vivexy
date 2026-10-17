'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@vivexy/ui/card';
import { Button } from '@vivexy/ui/button';
import { Checkbox } from '@vivexy/ui/checkbox';
import { Input } from '@vivexy/ui/input';
import { Switch } from '@vivexy/ui/switch';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@vivexy/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vivexy/ui/select';
import {
  useUpdateTeamSettings,
  useVerifyDomain,
} from '@vivexy/core/hooks/useAdmin';
import { chatService } from '@vivexy/core/services/chat.service';
import {
  DomainVerificationRecord,
  TeamAdminOverview,
} from '@vivexy/core/types/admin';
import { getApiErrorMessage } from '@vivexy/core/lib/admin-format';

const budgetSchema = z.object({
  monthlyBudgetUsd: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || (!isNaN(Number(value)) && Number(value) >= 0),
      'Enter a positive amount, or leave empty for no budget'
    ),
  budgetEnforcement: z.enum(['warn', 'block']),
});

type BudgetFormData = z.infer<typeof budgetSchema>;

const modelsSchema = z.object({
  restrictModels: z.boolean(),
  allowedModelIds: z.array(z.string()),
});

type ModelsFormData = z.infer<typeof modelsSchema>;

const BudgetCard = ({
  overview,
  readOnly,
}: {
  overview: TeamAdminOverview;
  readOnly: boolean;
}) => {
  const updateSettings = useUpdateTeamSettings();
  const form = useForm<BudgetFormData>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      monthlyBudgetUsd: overview.team.monthlyBudgetUsd?.toString() ?? '',
      budgetEnforcement: overview.team.budgetEnforcement ?? 'warn',
    },
  });

  const onSubmit = async (data: BudgetFormData) => {
    try {
      await updateSettings.mutateAsync({
        teamId: overview.team.id,
        settings: {
          monthlyBudgetUsd:
            data.monthlyBudgetUsd === '' ? null : Number(data.monthlyBudgetUsd),
          budgetEnforcement: data.budgetEnforcement,
        },
      });
      toast.success('Budget saved');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to save budget'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Monthly budget</CardTitle>
        <CardDescription>
          Owners and admins are emailed at 80% and 100% of the budget.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="monthlyBudgetUsd"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget (USD)</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="e.g. 500"
                      disabled={readOnly}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Leave empty for no budget.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="budgetEnforcement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>When the budget is reached</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={readOnly}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="warn">
                        Warn members, keep working
                      </SelectItem>
                      <SelectItem value="block">
                        Block new messages until next month
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={readOnly || updateSettings.isPending}
            >
              Save budget
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

const ModelsCard = ({
  overview,
  readOnly,
}: {
  overview: TeamAdminOverview;
  readOnly: boolean;
}) => {
  const updateSettings = useUpdateTeamSettings();
  const { data: models = [] } = useQuery({
    queryKey: ['chat', 'models', 'all'],
    queryFn: () => chatService.getModels(),
    staleTime: 5 * 60_000,
  });
  const form = useForm<ModelsFormData>({
    resolver: zodResolver(modelsSchema),
    defaultValues: {
      restrictModels: !!overview.team.allowedModelIds?.length,
      allowedModelIds: overview.team.allowedModelIds ?? [],
    },
  });
  const restrictModels = useWatch({
    control: form.control,
    name: 'restrictModels',
  });

  const onSubmit = async (data: ModelsFormData) => {
    if (data.restrictModels && data.allowedModelIds.length === 0) {
      form.setError('allowedModelIds', {
        message: 'Pick at least one model, or allow all models',
      });
      return;
    }
    try {
      await updateSettings.mutateAsync({
        teamId: overview.team.id,
        settings: {
          allowedModelIds: data.restrictModels ? data.allowedModelIds : null,
        },
      });
      toast.success('Model access saved');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to save model access'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Model access</CardTitle>
        <CardDescription>
          Limit which models members can use in team chats.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="restrictModels"
              render={({ field }) => (
                <FormItem>
                  <Select
                    value={field.value ? 'restricted' : 'all'}
                    onValueChange={(value) =>
                      field.onChange(value === 'restricted')
                    }
                    disabled={readOnly}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="all">All models</SelectItem>
                      <SelectItem value="restricted">
                        Only selected models
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            {restrictModels && (
              <FormField
                control={form.control}
                name="allowedModelIds"
                render={({ field }) => (
                  <FormItem>
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border p-3">
                      {models.map((model) => (
                        <label
                          key={model.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Checkbox
                            checked={field.value.includes(model.id)}
                            disabled={readOnly}
                            onCheckedChange={(checked) =>
                              field.onChange(
                                checked
                                  ? [...field.value, model.id]
                                  : field.value.filter((id) => id !== model.id)
                              )
                            }
                          />
                          {model.name}
                          <span className="text-xs text-muted-foreground">
                            {model.provider}
                          </span>
                        </label>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <Button
              type="submit"
              disabled={readOnly || updateSettings.isPending}
            >
              Save model access
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

const identitySchema = z.object({
  emailDomain: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' ||
        /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(value.replace(/^@/, '')),
      'Enter a domain like acme.com'
    ),
  autoJoinDomain: z.boolean(),
  requireSso: z.boolean(),
});

type IdentityFormData = z.infer<typeof identitySchema>;

const DnsRecordField = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs">
        {value}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          navigator.clipboard
            ?.writeText(value)
            .then(() => toast.success(`${label} copied`))
            .catch(() => toast.error('Copy failed'));
        }}
      >
        Copy
      </Button>
    </div>
  </div>
);

const DomainVerification = ({
  teamId,
  record,
  readOnly,
}: {
  teamId: string;
  record: DomainVerificationRecord;
  readOnly: boolean;
}) => {
  const verifyDomain = useVerifyDomain();

  const handleVerify = async () => {
    try {
      await verifyDomain.mutateAsync(teamId);
      toast.success('Domain verified');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Domain could not be verified'));
    }
  };

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-border p-3">
      <p className="text-sm">
        Add this TXT record at your DNS provider, then check it here.
      </p>
      <DnsRecordField label="Host" value={record.host} />
      <DnsRecordField label="Value" value={record.value} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleVerify}
        disabled={readOnly || verifyDomain.isPending}
      >
        {verifyDomain.isPending ? 'Checking DNS…' : 'Verify domain'}
      </Button>
    </div>
  );
};

const IdentityCard = ({
  overview,
  readOnly,
}: {
  overview: TeamAdminOverview;
  readOnly: boolean;
}) => {
  const updateSettings = useUpdateTeamSettings();
  const form = useForm<IdentityFormData>({
    resolver: zodResolver(identitySchema),
    defaultValues: {
      emailDomain: overview.team.emailDomain ?? '',
      autoJoinDomain: overview.team.autoJoinDomain,
      requireSso: overview.team.requireSso,
    },
  });

  const onSubmit = async (data: IdentityFormData) => {
    try {
      await updateSettings.mutateAsync({
        teamId: overview.team.id,
        settings: {
          emailDomain: data.emailDomain || null,
          autoJoinDomain: data.autoJoinDomain,
          requireSso: data.requireSso,
        },
      });
      toast.success('Sign-in settings saved');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to save sign-in settings'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sign-in & domain</CardTitle>
        <CardDescription>
          {overview.team.emailDomain
            ? overview.team.domainVerified
              ? `@${overview.team.emailDomain} is verified.`
              : `@${overview.team.emailDomain} is not verified yet.`
            : 'Claim your company domain to let colleagues join automatically.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {overview.team.emailDomain &&
          !overview.team.domainVerified &&
          overview.team.domainVerificationRecord && (
            <DomainVerification
              teamId={overview.team.id}
              record={overview.team.domainVerificationRecord}
              readOnly={readOnly}
            />
          )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="emailDomain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company email domain</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="acme.com"
                      disabled={readOnly}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Changing the domain requires verification again.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="autoJoinDomain"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div>
                    <FormLabel>Auto-join</FormLabel>
                    <FormDescription>
                      Verified users with this domain join as members.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={readOnly}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="requireSso"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div>
                    <FormLabel>Require SSO</FormLabel>
                    <FormDescription>
                      Members must sign in with Google or Microsoft; password
                      logins are refused. Make sure you can sign in with SSO
                      first.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={readOnly}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={readOnly || updateSettings.isPending}
            >
              Save sign-in settings
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

const RETENTION_OPTIONS = [
  { label: 'Keep forever', value: 'off' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
  { label: '180 days', value: '180' },
  { label: '1 year', value: '365' },
  { label: '2 years', value: '730' },
];

const RetentionCard = ({
  overview,
  readOnly,
}: {
  overview: TeamAdminOverview;
  readOnly: boolean;
}) => {
  const updateSettings = useUpdateTeamSettings();
  const currentValue = overview.team.retentionDays
    ? String(overview.team.retentionDays)
    : 'off';
  const options = RETENTION_OPTIONS.some(
    (option) => option.value === currentValue
  )
    ? RETENTION_OPTIONS
    : [
        ...RETENTION_OPTIONS,
        { label: `${currentValue} days`, value: currentValue },
      ];

  const handleChange = async (value: string) => {
    try {
      await updateSettings.mutateAsync({
        teamId: overview.team.id,
        settings: { retentionDays: value === 'off' ? null : Number(value) },
      });
      toast.success('Retention policy saved');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to save retention'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Data retention</CardTitle>
        <CardDescription>
          Team chats with no activity for this long are permanently deleted,
          including files. Usage and billing history are kept.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Select
          value={currentValue}
          onValueChange={handleChange}
          disabled={readOnly || updateSettings.isPending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
};

export const TeamAdminSettings = ({
  overview,
  readOnly,
}: {
  overview: TeamAdminOverview;
  readOnly: boolean;
}) => (
  <div className="grid gap-4 md:grid-cols-2">
    <BudgetCard overview={overview} readOnly={readOnly} />
    <ModelsCard overview={overview} readOnly={readOnly} />
    <IdentityCard overview={overview} readOnly={readOnly} />
    <RetentionCard overview={overview} readOnly={readOnly} />
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Plan & seats</CardTitle>
        <CardDescription>Managed by your account manager.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Seats used</span>
          <span className="font-medium tabular-nums">
            {overview.memberCount + overview.pendingInviteCount}
            {overview.team.seatLimit
              ? ` / ${overview.team.seatLimit}`
              : ' (unlimited)'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Seats count members plus pending invites. Contact support to change
          your seat limit.
        </p>
      </CardContent>
    </Card>
  </div>
);
