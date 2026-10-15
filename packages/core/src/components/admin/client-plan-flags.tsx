'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import { Switch } from '@vivexy/ui/switch';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@vivexy/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vivexy/ui/select';
import {
  useSetClientPlan,
  useUpdateClient,
} from '@vivexy/core/hooks/useSuperadmin';
import { ClientDetail, PlanKey } from '@vivexy/core/types/admin';
import { getApiErrorMessage } from '@vivexy/core/lib/admin-format';

const planSchema = z.object({
  plan: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
  status: z.enum(['ACTIVE', 'TRIALING']),
  periodEnd: z.string(),
});

type PlanFormData = z.infer<typeof planSchema>;

export const ClientPlanForm = ({ client }: { client: ClientDetail }) => {
  const setClientPlan = useSetClientPlan();
  const form = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      plan: client.plan as PlanKey,
      status: 'ACTIVE',
      periodEnd: '',
    },
  });
  const plan = useWatch({ control: form.control, name: 'plan' });

  const onSubmit = async (data: PlanFormData) => {
    try {
      await setClientPlan.mutateAsync({
        teamId: client.id,
        planData: {
          plan: data.plan,
          status: data.status,
          periodEnd: data.periodEnd
            ? new Date(data.periodEnd).toISOString()
            : null,
        },
      });
      toast.success(`Plan set to ${data.plan}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to change plan'));
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      >
        <FormField
          control={form.control}
          name="plan"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Plan</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="FREE">Free</SelectItem>
                  <SelectItem value="PRO">Pro</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Billing</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={plan === 'FREE'}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="ACTIVE">Paid / comp</SelectItem>
                  <SelectItem value="TRIALING">Trial</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="periodEnd"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Until</FormLabel>
              <FormControl>
                <Input type="date" disabled={plan === 'FREE'} {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit" size="sm" disabled={setClientPlan.isPending}>
          Apply
        </Button>
        <FormDescription className="sm:col-span-4">
          Manual plans are for comps, trials and invoiced clients. Stripe-billed
          clients are changed in Stripe.
        </FormDescription>
      </form>
    </Form>
  );
};

const FLAG_NAME_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;

export const FeatureFlagsEditor = ({ client }: { client: ClientDetail }) => {
  const updateClient = useUpdateClient();
  const [newFlag, setNewFlag] = useState('');
  const flags = client.featureFlags ?? {};

  const saveFlags = async (nextFlags: Record<string, boolean>) => {
    try {
      await updateClient.mutateAsync({
        teamId: client.id,
        update: { featureFlags: nextFlags },
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to update flags'));
    }
  };

  const addFlag = () => {
    const flagName = newFlag.trim().toLowerCase();
    if (!FLAG_NAME_PATTERN.test(flagName)) {
      toast.error('Use lowercase letters, numbers and underscores');
      return;
    }
    setNewFlag('');
    saveFlags({ ...flags, [flagName]: true });
  };

  const removeFlag = (flagName: string) => {
    const remainingFlags = { ...flags };
    delete remainingFlags[flagName];
    saveFlags(remainingFlags);
  };

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      {Object.keys(flags).length === 0 && (
        <p className="text-xs text-muted-foreground">No flags set.</p>
      )}
      {Object.entries(flags).map(([flagName, enabled]) => (
        <div key={flagName} className="flex items-center justify-between gap-2">
          <code className="text-xs">{flagName}</code>
          <div className="flex items-center gap-1">
            <Switch
              checked={enabled}
              aria-label={`Toggle ${flagName}`}
              onCheckedChange={(checked) =>
                saveFlags({ ...flags, [flagName]: checked })
              }
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${flagName}`}
              onClick={() => removeFlag(flagName)}
            >
              <X />
            </Button>
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <Input
          value={newFlag}
          onChange={(event) => setNewFlag(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addFlag();
            }
          }}
          placeholder="new_flag_name"
          className="h-8"
        />
        <Button size="sm" variant="outline" onClick={addFlag}>
          <Plus />
          Add
        </Button>
      </div>
    </div>
  );
};

export const DomainVerification = ({
  client,
  canManage,
}: {
  client: ClientDetail;
  canManage: boolean;
}) => {
  const updateClient = useUpdateClient();

  if (!client.emailDomain) {
    return (
      <p className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
        The client hasn&apos;t set an email domain.
      </p>
    );
  }

  const toggleVerified = async () => {
    try {
      await updateClient.mutateAsync({
        teamId: client.id,
        update: { domainVerified: !client.domainVerified },
      });
      toast.success(
        client.domainVerified ? 'Domain unverified' : 'Domain verified'
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to update domain'));
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <div>
        <p className="text-sm font-medium">
          @{client.emailDomain}{' '}
          <span
            className={
              client.domainVerified
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-muted-foreground'
            }
          >
            · {client.domainVerified ? 'verified' : 'unverified'}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Auto-join {client.autoJoinDomain ? 'on' : 'off'} · SSO{' '}
          {client.requireSso ? 'required' : 'optional'}. Verify only after
          confirming the client controls this domain.
        </p>
      </div>
      {canManage && (
        <Button
          size="sm"
          variant={client.domainVerified ? 'outline' : 'default'}
          onClick={toggleVerified}
          disabled={updateClient.isPending}
        >
          {client.domainVerified ? 'Unverify' : 'Verify'}
        </Button>
      )}
    </div>
  );
};
