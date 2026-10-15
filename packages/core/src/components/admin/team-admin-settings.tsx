'use client';

import { useForm } from 'react-hook-form';
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
import { useUpdateTeamSettings } from '@vivexy/core/hooks/useAdmin';
import { chatService } from '@vivexy/core/services/chat.service';
import { TeamAdminOverview } from '@vivexy/core/types/admin';
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
  const restrictModels = form.watch('restrictModels');

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
