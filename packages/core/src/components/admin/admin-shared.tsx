'use client';

import { ReactNode } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, ShieldOff } from 'lucide-react';
import { Card } from '@vivexy/ui/card';
import { Badge } from '@vivexy/ui/badge';
import { Button } from '@vivexy/ui/button';
import { Skeleton } from '@vivexy/ui/skeleton';
import { EmptyState } from '@vivexy/ui/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@vivexy/ui/alert-dialog';
import { cn } from '@vivexy/ui/utils';
import { DailyUsagePoint } from '@vivexy/core/types/admin';
import { formatCost, formatTokens } from '@vivexy/core/lib/admin-format';

interface StatCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  loading?: boolean;
  featured?: boolean;
}

export const StatCard = ({
  title,
  value,
  sub,
  icon,
  loading,
  featured,
}: StatCardProps) => (
  <Card
    className={cn(
      'relative overflow-hidden p-5',
      featured && 'border-transparent bg-night text-white ring-1 ring-white/10'
    )}
  >
    {featured && (
      <div className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-lime/25 blur-2xl" />
    )}
    <div className="relative flex items-center justify-between">
      <p
        className={cn(
          'text-xs font-medium uppercase tracking-[0.12em]',
          featured ? 'text-white/60' : 'text-muted-foreground'
        )}
      >
        {title}
      </p>
      <div
        className={cn(
          'flex size-8 items-center justify-center rounded-full [&_svg]:size-4',
          featured ? 'bg-lime text-lime-foreground' : 'bg-muted text-foreground'
        )}
      >
        {icon}
      </div>
    </div>
    <div className="relative mt-6">
      {loading ? (
        <Skeleton className={cn('h-9 w-28', featured && 'bg-white/10')} />
      ) : (
        <p
          className={cn(
            'font-serif text-4xl tracking-tight tabular-nums',
            featured && 'text-lime'
          )}
        >
          {value}
        </p>
      )}
      {sub && !loading && (
        <p
          className={cn(
            'mt-1 text-xs',
            featured ? 'text-white/60' : 'text-muted-foreground'
          )}
        >
          {sub}
        </p>
      )}
    </div>
  </Card>
);

export const Segmented = <T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) => (
  <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/60 p-1">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => onChange(option.value)}
        className={cn(
          'rounded-full px-3.5 py-1 text-sm font-medium transition-all',
          value === option.value
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export const PERIOD_OPTIONS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

export const UsageBarChart = ({
  data,
  metric,
  loading,
}: {
  data: DailyUsagePoint[];
  metric: 'tokens' | 'cost';
  loading?: boolean;
}) => {
  if (loading) return <Skeleton className="h-28 w-full" />;

  if (data.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        <BarChart3 className="size-5 opacity-50" />
        No usage in this period yet
      </div>
    );
  }

  const values = data.map((point) =>
    metric === 'tokens' ? point.totalTokens : point.totalCostUsd
  );
  const maxValue = Math.max(...values, 1);

  return (
    <div className="flex h-28 w-full items-end gap-1">
      {data.map((point, index) => {
        const label =
          metric === 'tokens'
            ? formatTokens(values[index])
            : formatCost(values[index]);
        return (
          <div
            key={point.date}
            className="group flex h-full min-w-0 flex-1 items-end"
            title={`${point.date}: ${label}`}
          >
            <div
              className="w-full rounded-t-md bg-lime/60 transition-colors group-hover:bg-lime"
              style={{
                height: `${Math.max((values[index] / maxValue) * 100, 2)}%`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};

export const AccessDenied = ({ description }: { description: string }) => (
  <EmptyState
    className="mt-10"
    icon={<ShieldOff />}
    title="You don't have access"
    description={description}
  />
);

export const Pagination = ({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-muted-foreground">
      <span>
        {total.toLocaleString()} total · page {page} of {pageCount}
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
};

export const RoleBadge = ({ role }: { role: string }) => {
  const variant =
    role === 'OWNER' || role === 'SUPER_ADMIN'
      ? 'lime'
      : role === 'ADMIN'
        ? 'secondary'
        : 'muted';
  return (
    <Badge variant={variant} className="capitalize">
      {role.replace('_', ' ').toLowerCase()}
    </Badge>
  );
};

export const StatusBadge = ({
  suspended,
  className,
}: {
  suspended: boolean;
  className?: string;
}) =>
  suspended ? (
    <Badge variant="destructive" className={className}>
      Suspended
    </Badge>
  ) : (
    <Badge variant="success" className={className}>
      Active
    </Badge>
  );

export const TableSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-3 p-4">
    {Array.from({ length: rows }).map((_, index) => (
      <Skeleton key={index} className="h-10 w-full" />
    ))}
  </div>
);

export const ConfirmAction = ({
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) => (
  <AlertDialog>
    <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          className={cn(
            destructive &&
              'bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/60'
          )}
        >
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
