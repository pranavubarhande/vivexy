'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Building2, Search } from 'lucide-react';
import { Card } from '@vivexy/ui/card';
import { Badge } from '@vivexy/ui/badge';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import { Textarea } from '@vivexy/ui/textarea';
import { EmptyState } from '@vivexy/ui/page-header';
import { Skeleton } from '@vivexy/ui/skeleton';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@vivexy/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vivexy/ui/table';
import {
  useClient,
  useClients,
  useUpdateClient,
} from '@vivexy/core/hooks/useSuperadmin';
import { useDebouncedValue } from '@vivexy/core/hooks/useDebouncedValue';
import { ClientDetail } from '@vivexy/core/types/admin';
import {
  formatCost,
  formatDate,
  formatRelative,
  formatTokens,
  getApiErrorMessage,
} from '@vivexy/core/lib/admin-format';
import { ClientPlanForm, FeatureFlagsEditor } from './client-plan-flags';
import {
  ConfirmAction,
  Pagination,
  RoleBadge,
  StatusBadge,
  TableSkeleton,
} from './admin-shared';

type StatusFilter = 'all' | 'active' | 'suspended';

const STATUS_TO_QUERY: Record<StatusFilter, boolean | undefined> = {
  all: undefined,
  active: false,
  suspended: true,
};

const PAGE_SIZE = 25;

const clientSettingsSchema = z.object({
  seatLimit: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' || (Number.isInteger(Number(value)) && Number(value) >= 1),
      'Enter a whole number of seats, or leave empty for unlimited'
    ),
  notes: z.string().max(5000),
});

type ClientSettingsFormData = z.infer<typeof clientSettingsSchema>;

const ClientSettingsForm = ({ client }: { client: ClientDetail }) => {
  const updateClient = useUpdateClient();
  const form = useForm<ClientSettingsFormData>({
    resolver: zodResolver(clientSettingsSchema),
    defaultValues: {
      seatLimit: client.seatLimit?.toString() ?? '',
      notes: client.notes ?? '',
    },
  });

  const onSubmit = async (data: ClientSettingsFormData) => {
    try {
      await updateClient.mutateAsync({
        teamId: client.id,
        update: {
          seatLimit: data.seatLimit === '' ? null : Number(data.seatLimit),
          notes: data.notes || null,
        },
      });
      toast.success('Client updated');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to update client'));
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="seatLimit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Seat limit</FormLabel>
              <FormControl>
                <Input inputMode="numeric" placeholder="Unlimited" {...field} />
              </FormControl>
              <FormDescription>
                Members + pending invites. New invites are blocked at the limit.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Internal notes</FormLabel>
              <FormControl>
                <Textarea
                  rows={4}
                  placeholder="Contract details, contacts, follow-ups…"
                  {...field}
                />
              </FormControl>
              <FormDescription>Only visible to superadmins.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="sm" disabled={updateClient.isPending}>
          Save changes
        </Button>
      </form>
    </Form>
  );
};

const DetailStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-border p-3">
    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 font-serif text-xl tabular-nums">{value}</p>
  </div>
);

const ClientDetailSheet = ({
  teamId,
  onClose,
}: {
  teamId: string | null;
  onClose: () => void;
}) => {
  const { data: client, isLoading } = useClient(teamId);
  const updateClient = useUpdateClient();

  const toggleSuspension = async () => {
    if (!client) return;
    try {
      await updateClient.mutateAsync({
        teamId: client.id,
        update: { isSuspended: !client.isSuspended },
      });
      toast.success(
        client.isSuspended ? 'Client reactivated' : 'Client suspended'
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to update client'));
    }
  };

  return (
    <Sheet open={!!teamId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {isLoading || !client ? (
          <div className="space-y-4 p-6">
            <SheetTitle className="sr-only">Loading client</SheetTitle>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {client.name}
                <StatusBadge suspended={client.isSuspended} />
              </SheetTitle>
              <SheetDescription>
                Owner{' '}
                {client.owner.name
                  ? `${client.owner.name} (${client.owner.email})`
                  : client.owner.email}{' '}
                · {client.plan} plan · since {formatDate(client.createdAt)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-8">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <DetailStat
                  label={`Spend ${client.periodDays}d`}
                  value={formatCost(client.usage.period.totalCostUsd)}
                />
                <DetailStat
                  label="This month"
                  value={formatCost(client.usage.monthToDate.totalCostUsd)}
                />
                <DetailStat
                  label="All time"
                  value={formatCost(client.usage.allTime.totalCostUsd)}
                />
                <DetailStat
                  label="Seats"
                  value={
                    client.seatLimit
                      ? `${client.members.length}/${client.seatLimit}`
                      : String(client.members.length)
                  }
                />
              </div>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Account</h3>
                <div className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">
                      {client.isSuspended ? 'Suspended' : 'Active'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Suspended clients can&apos;t invite members and their
                      admin panel is read-only.
                    </p>
                  </div>
                  <ConfirmAction
                    destructive={!client.isSuspended}
                    title={
                      client.isSuspended
                        ? 'Reactivate client?'
                        : 'Suspend client?'
                    }
                    description={
                      client.isSuspended
                        ? `${client.name} will regain full admin access.`
                        : `${client.name}'s admin panel becomes read-only and invites are blocked.`
                    }
                    confirmLabel={client.isSuspended ? 'Reactivate' : 'Suspend'}
                    onConfirm={toggleSuspension}
                    trigger={
                      <Button
                        size="sm"
                        variant={client.isSuspended ? 'outline' : 'destructive'}
                        disabled={updateClient.isPending}
                      >
                        {client.isSuspended ? 'Reactivate' : 'Suspend'}
                      </Button>
                    }
                  />
                </div>
                <ClientSettingsForm key={client.id} client={client} />
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Plan</h3>
                <ClientPlanForm key={`plan-${client.id}`} client={client} />
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Feature flags</h3>
                <FeatureFlagsEditor client={client} />
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">
                  Members ({client.members.length})
                </h3>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Last login</TableHead>
                        <TableHead className="text-right">Spend</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {client.members.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div className="font-medium">
                              {member.user.name || member.user.email}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {member.user.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            <RoleBadge role={member.role} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatRelative(member.user.lastLoginAt)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCost(member.usage.totalCostUsd)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {client.invites.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {
                      client.invites.filter((invite) => !invite.isExpired)
                        .length
                    }{' '}
                    pending invites
                  </p>
                )}
              </section>

              {client.recentAuditLogs.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Recent activity</h3>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {client.recentAuditLogs.map((entry) => (
                      <li key={entry.id}>
                        <span className="text-foreground">
                          {entry.actorEmail ?? 'System'}
                        </span>{' '}
                        {entry.action} · {formatRelative(entry.createdAt)}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export const SuperadminClients = () => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading } = useClients({
    search: debouncedSearch || undefined,
    suspended: STATUS_TO_QUERY[status],
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <Card className="p-0">
      <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by client name or owner email"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as StatusFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} />
      ) : !data?.items.length ? (
        <EmptyState
          className="m-4"
          icon={<Building2 />}
          title="No clients found"
          description="Clients appear here as soon as a user creates a team."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Seats</TableHead>
                  <TableHead className="text-right">Tokens (30d)</TableHead>
                  <TableHead className="text-right">Spend (30d)</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((client) => (
                  <TableRow
                    key={client.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedClientId(client.id)}
                  >
                    <TableCell>
                      <div className="font-medium">{client.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Created {formatDate(client.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {client.owner.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{client.plan}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {client.seatLimit
                        ? `${client.memberCount}/${client.seatLimit}`
                        : client.memberCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(client.usage.totalTokens)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCost(client.usage.totalCostUsd)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatRelative(client.usage.lastActiveAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge suspended={client.isSuspended} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data.total}
            onPageChange={setPage}
          />
        </>
      )}

      <ClientDetailSheet
        teamId={selectedClientId}
        onClose={() => setSelectedClientId(null)}
      />
    </Card>
  );
};
