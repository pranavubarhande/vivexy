'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Search, Users } from 'lucide-react';
import { Card } from '@vivexy/ui/card';
import { Badge } from '@vivexy/ui/badge';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import { EmptyState } from '@vivexy/ui/page-header';
import { Skeleton } from '@vivexy/ui/skeleton';
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
  usePlatformUser,
  usePlatformUsers,
  useUpdatePlatformUser,
} from '@vivexy/core/hooks/useSuperadmin';
import { useDebouncedValue } from '@vivexy/core/hooks/useDebouncedValue';
import { useAuth } from '@vivexy/core/shared/auth-provider';
import { PlatformUserUpdateData } from '@vivexy/core/types/admin';
import { Role } from '@vivexy/core/types/user';
import {
  formatCost,
  formatDate,
  formatRelative,
  formatTokens,
  getApiErrorMessage,
} from '@vivexy/core/lib/admin-format';
import {
  ConfirmAction,
  Pagination,
  RoleBadge,
  StatusBadge,
  TableSkeleton,
  UsageBarChart,
} from './admin-shared';

type StatusFilter = 'all' | 'active' | 'suspended';
type RoleFilter = 'all' | Role;

const STATUS_TO_QUERY: Record<StatusFilter, boolean | undefined> = {
  all: undefined,
  active: false,
  suspended: true,
};

const PAGE_SIZE = 25;

const DetailStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-border p-3">
    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 font-serif text-xl tabular-nums">{value}</p>
  </div>
);

const UserDetailSheet = ({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}) => {
  const { user: currentUser } = useAuth();
  const { data: user, isLoading } = usePlatformUser(userId);
  const updateUser = useUpdatePlatformUser();
  const isSelf = user?.id === currentUser?.id;

  const applyUpdate = async (
    update: PlatformUserUpdateData,
    message: string
  ) => {
    if (!user) return;
    try {
      await updateUser.mutateAsync({ userId: user.id, update });
      toast.success(message);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to update user'));
    }
  };

  return (
    <Sheet open={!!userId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {isLoading || !user ? (
          <div className="space-y-4 p-6">
            <SheetTitle className="sr-only">Loading user</SheetTitle>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {user.name || user.email}
                <RoleBadge role={user.role} />
                <StatusBadge suspended={user.isSuspended} />
              </SheetTitle>
              <SheetDescription>
                {user.email} · joined {formatDate(user.createdAt)} · last login{' '}
                {formatRelative(user.lastLoginAt)}
                {user.oauthProvider && ` · via ${user.oauthProvider}`}
                {!user.emailVerified && ' · email unverified'}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-8">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <DetailStat
                  label={`Spend ${user.periodDays}d`}
                  value={formatCost(user.usage.totalCostUsd)}
                />
                <DetailStat
                  label="All-time spend"
                  value={formatCost(user.allTimeUsage.totalCostUsd)}
                />
                <DetailStat
                  label="Tokens all time"
                  value={formatTokens(user.allTimeUsage.totalTokens)}
                />
                <DetailStat label="Chats" value={user.chatCount.toString()} />
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Daily spend ({user.periodDays}d)
                </h3>
                <UsageBarChart data={user.daily} metric="cost" />
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Access</h3>
                {isSelf ? (
                  <p className="text-xs text-muted-foreground">
                    You can&apos;t change your own role or suspend yourself.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                      <div>
                        <p className="text-sm font-medium">Platform role</p>
                        <p className="text-xs text-muted-foreground">
                          Super admins can see and change every client.
                        </p>
                      </div>
                      <Select
                        value={user.role}
                        onValueChange={(role) =>
                          applyUpdate({ role: role as Role }, 'Role updated')
                        }
                        disabled={updateUser.isPending}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USER">User</SelectItem>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="SUPER_ADMIN">
                            Super admin
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                      <div>
                        <p className="text-sm font-medium">
                          {user.isSuspended ? 'Suspended' : 'Active'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Suspended users are signed out and can&apos;t log in.
                        </p>
                      </div>
                      <ConfirmAction
                        destructive={!user.isSuspended}
                        title={
                          user.isSuspended
                            ? 'Reactivate user?'
                            : 'Suspend user?'
                        }
                        description={
                          user.isSuspended
                            ? `${user.email} will be able to log in again.`
                            : `${user.email} will be blocked from every request immediately.`
                        }
                        confirmLabel={
                          user.isSuspended ? 'Reactivate' : 'Suspend'
                        }
                        onConfirm={() =>
                          applyUpdate(
                            { isSuspended: !user.isSuspended },
                            user.isSuspended
                              ? 'User reactivated'
                              : 'User suspended'
                          )
                        }
                        trigger={
                          <Button
                            size="sm"
                            variant={
                              user.isSuspended ? 'outline' : 'destructive'
                            }
                            disabled={updateUser.isPending}
                          >
                            {user.isSuspended ? 'Reactivate' : 'Suspend'}
                          </Button>
                        }
                      />
                    </div>
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Teams ({user.teams.length})
                </h3>
                {user.teams.length ? (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {user.teams.map((team) => (
                      <li
                        key={team.id}
                        className="flex items-center justify-between gap-3 p-3 text-sm"
                      >
                        <span className="font-medium">{team.name}</span>
                        <span className="flex items-center gap-2">
                          {team.isSuspended && <StatusBadge suspended />}
                          <RoleBadge role={team.role} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Not a member of any team.
                  </p>
                )}
              </section>

              {user.byModel.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Models used</h3>
                  <ul className="space-y-1 text-sm">
                    {user.byModel.map((model) => (
                      <li
                        key={`${model.provider}-${model.modelName}`}
                        className="flex justify-between gap-3"
                      >
                        <span className="truncate">{model.modelName}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatCost(model.totalCostUsd)}
                        </span>
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

export const SuperadminUsers = () => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [role, setRole] = useState<RoleFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading } = usePlatformUsers({
    search: debouncedSearch || undefined,
    suspended: STATUS_TO_QUERY[status],
    role: role === 'all' ? undefined : role,
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
            placeholder="Search by name or email"
            className="pl-9"
          />
        </div>
        <Select
          value={role}
          onValueChange={(value) => {
            setRole(value as RoleFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="USER">Users</SelectItem>
            <SelectItem value="ADMIN">Admins</SelectItem>
            <SelectItem value="SUPER_ADMIN">Super admins</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as StatusFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
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
          icon={<Users />}
          title="No users found"
          description="Try a different search or filter."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Teams</TableHead>
                  <TableHead className="text-right">Messages (30d)</TableHead>
                  <TableHead className="text-right">Spend (30d)</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((user) => (
                  <TableRow
                    key={user.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    <TableCell>
                      <div className="font-medium">
                        {user.name || user.email}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {user.email}
                        {!user.emailVerified && (
                          <Badge variant="muted" className="px-1.5 py-0">
                            unverified
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {user.teamCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {user.usage.messageCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCost(user.usage.totalCostUsd)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatRelative(user.lastLoginAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge suspended={user.isSuspended} />
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

      <UserDetailSheet
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
      />
    </Card>
  );
};
