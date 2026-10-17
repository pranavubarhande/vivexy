'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Coins,
  Download,
  Gauge,
  UserCheck,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@vivexy/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vivexy/ui/select';
import { Skeleton } from '@vivexy/ui/skeleton';
import { Button } from '@vivexy/ui/button';
import { adminService } from '@vivexy/core/services/admin.service';
import {
  useAdministeredTeams,
  useTeamAdminOverview,
  useTeamAuditLogs,
} from '@vivexy/core/hooks/useAdmin';
import { TeamAdminOverview } from '@vivexy/core/types/admin';
import {
  downloadBlob,
  formatCost,
  formatTokens,
  getApiErrorMessage,
} from '@vivexy/core/lib/admin-format';
import {
  AccessDenied,
  PERIOD_OPTIONS,
  Segmented,
  StatCard,
  UsageBarChart,
} from './admin-shared';
import { AuditLogTable } from './audit-log-table';
import { TeamAdminMembers, TeamAdminInvites } from './team-admin-members';
import { TeamAdminSettings } from './team-admin-settings';

const budgetLabel = (overview: TeamAdminOverview) => {
  const budget = overview.team.monthlyBudgetUsd;
  if (!budget) return 'No monthly budget set';
  const percentUsed = Math.round((overview.monthToDateCostUsd / budget) * 100);
  return `${percentUsed}% of ${formatCost(budget)} budget`;
};

const TeamOverview = ({
  overview,
  isLoading,
}: {
  overview?: TeamAdminOverview;
  isLoading: boolean;
}) => {
  const [chartMetric, setChartMetric] = useState<'cost' | 'tokens'>('cost');
  const seatLimit = overview?.team.seatLimit;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          featured
          title="Team spend"
          value={formatCost(overview?.usage.totalCostUsd ?? 0)}
          sub={`Last ${overview?.periodDays ?? 30} days`}
          icon={<Coins />}
          loading={isLoading}
        />
        <StatCard
          title="This month"
          value={formatCost(overview?.monthToDateCostUsd ?? 0)}
          sub={overview ? budgetLabel(overview) : undefined}
          icon={<Gauge />}
          loading={isLoading}
        />
        <StatCard
          title="Seats"
          value={
            seatLimit
              ? `${overview?.memberCount ?? 0}/${seatLimit}`
              : String(overview?.memberCount ?? 0)
          }
          sub={`${overview?.pendingInviteCount ?? 0} pending ${
            overview?.pendingInviteCount === 1 ? 'invite' : 'invites'
          }`}
          icon={<Users />}
          loading={isLoading}
        />
        <StatCard
          title="Active members"
          value={String(overview?.activeMemberCount ?? 0)}
          sub={`${formatTokens(overview?.usage.totalTokens ?? 0)} tokens used`}
          icon={<UserCheck />}
          loading={isLoading}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Daily usage</CardTitle>
              <CardDescription>
                Usage from chats billed to this team
              </CardDescription>
            </div>
            <Segmented
              options={[
                { label: 'Cost', value: 'cost' as const },
                { label: 'Tokens', value: 'tokens' as const },
              ]}
              value={chartMetric}
              onChange={setChartMetric}
            />
          </div>
        </CardHeader>
        <CardContent>
          <UsageBarChart
            data={overview?.daily ?? []}
            metric={chartMetric}
            loading={isLoading}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Usage by model</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : overview?.byModel.length ? (
            overview.byModel.map((model) => {
              const sharePercent = overview.usage.totalCostUsd
                ? (model.totalCostUsd / overview.usage.totalCostUsd) * 100
                : 0;
              return (
                <div key={`${model.provider}-${model.modelName}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium">
                      {model.modelName}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {model.provider}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {formatCost(model.totalCostUsd)}
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

      <p className="text-center text-xs text-muted-foreground">
        Only chats started with this team selected under &ldquo;Usage billed
        to&rdquo; count toward team usage. Personal chats are excluded.
      </p>
    </div>
  );
};

const TeamActivity = ({ teamId }: { teamId: string }) => {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useTeamAuditLogs(teamId, page);
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

export const TeamAdminPanel = () => {
  const { data: teams, isLoading: teamsLoading } = useAdministeredTeams();
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [days, setDays] = useState(30);

  const teamId = selectedTeamId || teams?.[0]?.id || '';
  const { data: overview, isLoading: overviewLoading } = useTeamAdminOverview(
    teamId,
    days
  );

  if (teamsLoading) {
    return (
      <PageContainer className="space-y-4">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-40 w-full" />
      </PageContainer>
    );
  }

  if (!teams?.length) {
    return (
      <PageContainer>
        <AccessDenied description="The admin panel is available to team owners and admins. Create a team or ask your team owner to make you an admin." />
      </PageContainer>
    );
  }

  const isOwner = overview?.viewerRole === 'OWNER';

  const handleExport = async () => {
    try {
      const csvBlob = await adminService.exportUsageCsv(teamId, days);
      downloadBlob(
        csvBlob,
        `${overview?.team.slug ?? 'team'}-usage-${days}d.csv`
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Export failed'));
    }
  };

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        className="mb-2"
        eyebrow="Admin"
        title={overview?.team.name ?? 'Team admin'}
        description="Manage members, seats, spend and activity for your team."
        actions={
          <>
            {teams.length > 1 && (
              <Select value={teamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Segmented
              options={PERIOD_OPTIONS}
              value={days}
              onChange={setDays}
            />
            <Button variant="outline" onClick={handleExport}>
              <Download />
              Export CSV
            </Button>
          </>
        }
      />

      {overview?.team.isSuspended && (
        <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive dark:text-red-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          This team is suspended. The admin panel is read-only until support
          reactivates it.
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <TeamOverview overview={overview} isLoading={overviewLoading} />
        </TabsContent>
        <TabsContent value="members">
          <TeamAdminMembers
            teamId={teamId}
            days={days}
            isOwner={isOwner}
            readOnly={!!overview?.team.isSuspended}
          />
        </TabsContent>
        <TabsContent value="invites">
          <TeamAdminInvites
            teamId={teamId}
            readOnly={!!overview?.team.isSuspended}
          />
        </TabsContent>
        <TabsContent value="settings">
          {overview && (
            <TeamAdminSettings
              key={teamId}
              overview={overview}
              readOnly={overview.team.isSuspended}
            />
          )}
        </TabsContent>
        <TabsContent value="activity">
          <TeamActivity teamId={teamId} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
};
