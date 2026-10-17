'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Crown, MailX, Trash2, UserPlus } from 'lucide-react';
import { Card } from '@vivexy/ui/card';
import { Badge } from '@vivexy/ui/badge';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import { EmptyState } from '@vivexy/ui/page-header';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vivexy/ui/table';
import {
  adminKeys,
  useAdminRemoveMember,
  useRevokeInvite,
  useTeamAdminInvites,
  useTeamAdminMembers,
  useTransferOwnership,
  useUpdateMemberRole,
} from '@vivexy/core/hooks/useAdmin';
import { useInviteMember } from '@vivexy/core/hooks/useTeams';
import { useAuth } from '@vivexy/core/shared/auth-provider';
import { TeamRole } from '@vivexy/core/types/team';
import {
  formatCost,
  formatDate,
  formatRelative,
  formatTokens,
  getApiErrorMessage,
} from '@vivexy/core/lib/admin-format';
import { BulkInviteDialog } from './bulk-invite-dialog';
import {
  ConfirmAction,
  RoleBadge,
  StatusBadge,
  TableSkeleton,
} from './admin-shared';

const inviteSchema = z.object({
  email: z.email('Enter a valid email'),
  role: z.enum(['ADMIN', 'MEMBER']),
});

type InviteFormData = z.infer<typeof inviteSchema>;

const InviteMemberForm = ({ teamId }: { teamId: string }) => {
  const queryClient = useQueryClient();
  const inviteMember = useInviteMember();
  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'MEMBER' },
  });

  const onSubmit = async (data: InviteFormData) => {
    try {
      await inviteMember.mutateAsync({ teamId, data });
      queryClient.invalidateQueries({ queryKey: adminKeys.team(teamId) });
      form.reset();
      toast.success(`Invited ${data.email}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to invite member'));
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-start"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormControl>
                <Input placeholder="colleague@company.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={inviteMember.isPending}>
          <UserPlus />
          Invite
        </Button>
      </form>
    </Form>
  );
};

export const TeamAdminMembers = ({
  teamId,
  days,
  isOwner,
  readOnly,
}: {
  teamId: string;
  days: number;
  isOwner: boolean;
  readOnly: boolean;
}) => {
  const { user: currentUser } = useAuth();
  const { data: members, isLoading } = useTeamAdminMembers(teamId, days);
  const updateRole = useUpdateMemberRole();
  const removeMember = useAdminRemoveMember();
  const transferOwnership = useTransferOwnership();

  const handleRoleChange = async (userId: string, role: TeamRole) => {
    try {
      await updateRole.mutateAsync({ teamId, userId, role });
      toast.success('Role updated');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to update role'));
    }
  };

  const handleTransfer = async (userId: string, email: string) => {
    try {
      await transferOwnership.mutateAsync({ teamId, userId });
      toast.success(`${email} now owns this team`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to transfer ownership'));
    }
  };

  const handleRemove = async (userId: string, email: string) => {
    try {
      await removeMember.mutateAsync({ teamId, userId });
      toast.success(`Removed ${email}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to remove member'));
    }
  };

  return (
    <Card className="p-0">
      {!readOnly && (
        <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-start">
          <InviteMemberForm teamId={teamId} />
          <BulkInviteDialog teamId={teamId} />
        </div>
      )}
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Spend ({days}d)</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members?.map((member) => {
                const isSelf = member.user.id === currentUser?.id;
                const isTeamOwner = member.role === 'OWNER';
                const canEditRole = isOwner && !isTeamOwner && !readOnly;
                const canRemove =
                  !isTeamOwner &&
                  !isSelf &&
                  !readOnly &&
                  (isOwner || member.role !== 'ADMIN');
                const canTransfer = canEditRole && !member.user.isSuspended;
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="font-medium">
                        {member.user.name || member.user.email}
                        {isSelf && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {member.user.email}
                      </div>
                      {member.user.isSuspended && (
                        <StatusBadge suspended className="mt-1" />
                      )}
                    </TableCell>
                    <TableCell>
                      {canEditRole ? (
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            handleRoleChange(member.user.id, role as TeamRole)
                          }
                        >
                          <SelectTrigger className="h-8 w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MEMBER">Member</SelectItem>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <RoleBadge role={member.role} />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatRelative(member.user.lastLoginAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {member.usage.messageCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(member.usage.totalTokens)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCost(member.usage.totalCostUsd)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {canTransfer && (
                        <ConfirmAction
                          title="Transfer ownership?"
                          description={`${member.user.email} will own this team. You'll stay on as an admin and can't undo this yourself.`}
                          confirmLabel="Transfer"
                          onConfirm={() =>
                            handleTransfer(member.user.id, member.user.email)
                          }
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Make ${member.user.email} the owner`}
                              title="Make owner"
                            >
                              <Crown />
                            </Button>
                          }
                        />
                      )}
                      {canRemove && (
                        <ConfirmAction
                          destructive
                          title="Remove member?"
                          description={`${member.user.email} will lose access to this team.`}
                          confirmLabel="Remove"
                          onConfirm={() =>
                            handleRemove(member.user.id, member.user.email)
                          }
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${member.user.email}`}
                            >
                              <Trash2 className="text-destructive" />
                            </Button>
                          }
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
};

export const TeamAdminInvites = ({
  teamId,
  readOnly,
}: {
  teamId: string;
  readOnly: boolean;
}) => {
  const { data: invites, isLoading } = useTeamAdminInvites(teamId);
  const revokeInvite = useRevokeInvite();

  const handleRevoke = async (inviteId: string, email: string) => {
    try {
      await revokeInvite.mutateAsync({ teamId, inviteId });
      toast.success(`Revoked invite for ${email}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to revoke invite'));
    }
  };

  if (isLoading) return <TableSkeleton />;
  if (!invites?.length) {
    return (
      <EmptyState
        icon={<MailX />}
        title="No invites"
        description="Invites sent to people without an account show up here until they join."
      />
    );
  }

  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((invite) => (
              <TableRow key={invite.id}>
                <TableCell className="font-medium">{invite.email}</TableCell>
                <TableCell>
                  <RoleBadge role={invite.role} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(invite.createdAt)}
                </TableCell>
                <TableCell>
                  {invite.isExpired ? (
                    <Badge variant="muted">Expired</Badge>
                  ) : (
                    <span className="text-muted-foreground">
                      {formatDate(invite.expiresAt)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={revokeInvite.isPending}
                      onClick={() => handleRevoke(invite.id, invite.email)}
                    >
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};
