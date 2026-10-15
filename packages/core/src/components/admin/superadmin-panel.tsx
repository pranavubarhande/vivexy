'use client';

import { useState } from 'react';
import {
  Activity,
  Building2,
  Coins,
  MessageSquare,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { PageContainer, PageHeader } from '@vivexy/ui/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@vivexy/ui/card';
import { Skeleton } from '@vivexy/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@vivexy/ui/tabs';
import { useAuth } from '@vivexy/core/shared/auth-provider';
import {
  usePlatformAuditLogs,
  usePlatformOverview,
  usePlatformUsage,
} from '@vivexy/core/hooks/useSuperadmin';
import { formatCost, formatTokens } from '@vivexy/core/lib/admin-format';
import {
  AccessDenied,
  PERIOD_OPTIONS,
  Segmented,
  StatCard,
  UsageBarChart,
} from './admin-shared';
import { AuditLogTable } from './audit-log-table';
import { SuperadminClients } from './superadmin-clients';
import { SuperadminUsers } from './superadmin-users';
import { SuperadminModels } from './superadmin-models';
import { SuperadminHealth } from './superadmin-health';
import { SuperadminAnnouncements } from './superadmin-announcements';

const PlatformOverviewTab = () => {
  const [days, setDays] = useState(30);
  const [chartMetric, setChartMetric] = useState<'cost' | 'tokens'>('cost');
  const { data: overview, isLoading } = usePlatformOverview();
  const { data: usage, isLoading: usageLoading } = usePlatformUsage(days);

  const planEntries = Object.entries(overview?.subscriptions.paidByPlan ?? {});
  const grossMargin =
    (overview?.revenue.mrrUsd ?? 0) - (overview?.revenue.aiCost30dUsd ?? 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          featured
          title="MRR"
          value={formatCost(overview?.revenue.mrrUsd ?? 0)}
          sub={`${formatCost(overview?.revenue.arrUsd ?? 0)} ARR`}
          icon={<TrendingUp />}
          loading={isLoading}
        />
        <StatCard
          title="AI cost (30d)"
          value={formatCost(overview?.revenue.aiCost30dUsd ?? 0)}
          sub={`${grossMargin >= 0 ? '' : '-'}${formatCost(Math.abs(grossMargin))} margin vs MRR`}
          icon={<Coins />}
          loading={isLoading}
        />
        <StatCard
          title="Trials"
          value={(overview?.subscriptions.trialing ?? 0).toLocaleString()}
          sub="Active trials"
          icon={<UserPlus />}
          loading={isLoading}
        />
        <StatCard
          title="Churn (30d)"
          value={(overview?.subscriptions.churned30d ?? 0).toLocaleString()}
          sub="Canceled subscriptions"
          icon={<TrendingDown />}
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Spend (30d)"
          value={formatCost(overview?.usage.last30d.totalCostUsd ?? 0)}
          sub={`${formatCost(overview?.usage.monthToDate.totalCostUsd ?? 0)} this month`}
          icon={<Coins />}
          loading={isLoading}
        />
        <StatCard
          title="Clients"
          value={(overview?.clients.total ?? 0).toLocaleString()}
          sub={`+${overview?.clients.new30d ?? 0} in 30d · ${overview?.clients.suspended ?? 0} suspended`}
          icon={<Building2 />}
          loading={isLoading}
        />
        <StatCard
          title="Users"
          value={(overview?.users.total ?? 0).toLocaleString()}
          sub={`+${overview?.users.new7d ?? 0} in 7d · +${overview?.users.new30d ?? 0} in 30d`}
          icon={<Users />}
          loading={isLoading}
        />
        <StatCard
          title="Active users (30d)"
          value={(overview?.users.active30d ?? 0).toLocaleString()}
          sub={
            overview?.users.total
              ? `${Math.round((overview.users.active30d / overview.users.total) * 100)}% of all users`
              : undefined
          }
          icon={<Activity />}
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Chats"
          value={(overview?.activity.chats ?? 0).toLocaleString()}
          icon={<MessageSquare />}
          loading={isLoading}
        />
        <StatCard
          title="Messages"
          value={(overview?.activity.messages ?? 0).toLocaleString()}
          icon={<MessageSquare />}
          loading={isLoading}
        />
        <StatCard
          title="Tokens (30d)"
          value={formatTokens(overview?.usage.last30d.totalTokens ?? 0)}
          sub={`${formatTokens(overview?.usage.allTime.totalTokens ?? 0)} all time`}
          icon={<Activity />}
          loading={isLoading}
        />
        <StatCard
          title="Paid subscriptions"
          value={(overview?.subscriptions.activeTotal ?? 0).toLocaleString()}
          sub={
            planEntries.length
              ? planEntries
                  .map(([plan, count]) => `${plan} ${count}`)
                  .join(' · ')
              : 'No paid plans yet'
          }
          icon={<UserPlus />}
          loading={isLoading}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Platform usage</CardTitle>
              <CardDescription>All clients, last {days} days</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Segmented
                options={[
                  { label: 'Cost', value: 'cost' as const },
                  { label: 'Tokens', value: 'tokens' as const },
                ]}
                value={chartMetric}
                onChange={setChartMetric}
              />
              <Segmented
                options={PERIOD_OPTIONS}
                value={days}
                onChange={setDays}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <UsageBarChart
            data={usage?.daily ?? []}
            metric={chartMetric}
            loading={usageLoading}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Model mix</CardTitle>
          <CardDescription>Where platform spend goes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {usageLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : usage?.byModel.length ? (
            usage.byModel.map((model) => {
              const totalCost = usage.byModel.reduce(
                (sum, row) => sum + row.totalCostUsd,
                0
              );
              const sharePercent = totalCost
                ? (model.totalCostUsd / totalCost) * 100
                : 0;
              return (
                <div key={`${model.provider}-${model.modelName}`}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">
                      {model.modelName}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {model.provider}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatTokens(model.totalTokens)} ·{' '}
                      <span className="font-medium text-foreground">
                        {formatCost(model.totalCostUsd)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-lime"
                      style={{ width: `${sharePercent}%` }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No usage data for this period
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const PlatformAuditTab = () => {
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePlatformAuditLogs(page);
  return (
    <Card className="p-0">
      <AuditLogTable
        data={data}
        isLoading={isLoading}
        page={page}
        onPageChange={setPage}
      />
    </Card>
  );
};

export const SuperadminPanel = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <PageContainer className="space-y-4">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-40 w-full" />
      </PageContainer>
    );
  }

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <PageContainer>
        <AccessDenied description="The superadmin console is restricted to platform operators." />
      </PageContainer>
    );
  }

  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        className="mb-2"
        eyebrow="Superadmin"
        title="Platform console"
        description="Track every client, user and dollar of spend across the platform."
      />
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <PlatformOverviewTab />
        </TabsContent>
        <TabsContent value="clients">
          <SuperadminClients />
        </TabsContent>
        <TabsContent value="users">
          <SuperadminUsers />
        </TabsContent>
        <TabsContent value="models">
          <SuperadminModels />
        </TabsContent>
        <TabsContent value="health">
          <SuperadminHealth />
        </TabsContent>
        <TabsContent value="announcements">
          <SuperadminAnnouncements />
        </TabsContent>
        <TabsContent value="audit">
          <PlatformAuditTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
};
