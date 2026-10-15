'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@vivexy/ui/card';
import { Button } from '@vivexy/ui/button';
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
import { useUpdateTeamSettings } from '@vivexy/core/hooks/useAdmin';
import { TeamAdminOverview } from '@vivexy/core/types/admin';
import { getApiErrorMessage } from '@vivexy/core/lib/admin-format';

const settingsSchema = z.object({
  monthlyBudgetUsd: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || (!isNaN(Number(value)) && Number(value) >= 0),
      'Enter a positive amount, or leave empty for no budget'
    ),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export const TeamAdminSettings = ({
  overview,
  readOnly,
}: {
  overview: TeamAdminOverview;
  readOnly: boolean;
}) => {
  const updateSettings = useUpdateTeamSettings();
  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      monthlyBudgetUsd: overview.team.monthlyBudgetUsd?.toString() ?? '',
    },
  });

  const onSubmit = async (data: SettingsFormData) => {
    try {
      await updateSettings.mutateAsync({
        teamId: overview.team.id,
        monthlyBudgetUsd:
          data.monthlyBudgetUsd === '' ? null : Number(data.monthlyBudgetUsd),
      });
      toast.success('Settings saved');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to save settings'));
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly budget</CardTitle>
          <CardDescription>
            Track team spend against a monthly target.
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
                    <FormDescription>
                      Leave empty for no budget.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                disabled={readOnly || updateSettings.isPending}
              >
                Save
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

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
};
