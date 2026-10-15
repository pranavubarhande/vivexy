'use client';

import { ScrollText } from 'lucide-react';
import { EmptyState } from '@vivexy/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@vivexy/ui/table';
import { AuditLogEntry, Paginated } from '@vivexy/core/types/admin';
import { formatRelative } from '@vivexy/core/lib/admin-format';
import { Pagination, TableSkeleton } from './admin-shared';

const ACTION_LABELS: Record<string, string> = {
  'team.member_role_changed': 'Changed member role',
  'team.member_removed': 'Removed member',
  'team.invite_revoked': 'Revoked invite',
  'team.settings_updated': 'Updated team settings',
  'superadmin.client_updated': 'Updated client',
  'superadmin.user_updated': 'Updated user',
  'superadmin.client_plan_changed': 'Changed client plan',
  'superadmin.impersonation_started': 'Viewed as user',
  'superadmin.model_updated': 'Updated model',
  'superadmin.announcement_created': 'Published announcement',
  'superadmin.announcement_updated': 'Updated announcement',
  'superadmin.announcement_deleted': 'Deleted announcement',
  'superadmin.user_data_exported': 'Exported user data',
  'superadmin.user_erased': 'Erased user',
  'team.member_auto_joined': 'Member auto-joined via domain',
  'system.retention_purged': 'Retention purge',
};

const describeDetails = (details: Record<string, unknown>) =>
  Object.entries(details)
    .map(([key, value]) => {
      if (value && typeof value === 'object' && 'to' in value) {
        const change = value as { from: unknown; to: unknown };
        return `${key}: ${String(change.from ?? '—')} → ${String(change.to ?? '—')}`;
      }
      return `${key}: ${String(value)}`;
    })
    .join(' · ');

export const AuditLogTable = ({
  data,
  isLoading,
  page,
  onPageChange,
}: {
  data?: Paginated<AuditLogEntry>;
  isLoading: boolean;
  page: number;
  onPageChange: (page: number) => void;
}) => {
  if (isLoading) return <TableSkeleton />;
  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        className="m-4"
        icon={<ScrollText />}
        title="No activity yet"
        description="Privileged actions such as role changes and suspensions will appear here."
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell
                  className="whitespace-nowrap text-muted-foreground"
                  title={entry.createdAt}
                >
                  {formatRelative(entry.createdAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {entry.actorEmail ?? 'System'}
                </TableCell>
                <TableCell className="whitespace-nowrap font-medium">
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground">
                  {describeDetails(entry.details)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination
        page={page}
        pageSize={data.pageSize}
        total={data.total}
        onPageChange={onPageChange}
      />
    </>
  );
};
