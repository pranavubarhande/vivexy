'use client';

import { Activity, CalendarClock, Database, Server } from 'lucide-react';
import { Badge } from '@vivexy/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@vivexy/ui/card';
import { usePlatformHealth } from '@vivexy/core/hooks/useSuperadmin';
import { formatRelative } from '@vivexy/core/lib/admin-format';
import { StatCard, TableSkeleton } from './admin-shared';

const StatusPill = ({ ok }: { ok: boolean }) =>
  ok ? (
    <Badge variant="success">Healthy</Badge>
  ) : (
    <Badge variant="destructive">Down</Badge>
  );

export const SuperadminHealth = () => {
  const { data: health, isLoading } = usePlatformHealth();

  if (isLoading || !health) return <TableSkeleton rows={4} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Database"
          value={health.database.ok ? `${health.database.latencyMs}ms` : 'Down'}
          sub="Query latency"
          icon={<Database />}
        />
        <StatCard
          title="Redis"
          value={health.redis.ok ? `${health.redis.latencyMs}ms` : 'Down'}
          sub={health.redis.ok ? 'Ping latency' : health.redis.error}
          icon={<Server />}
        />
        <StatCard
          title="Messages (1h)"
          value={health.activity.messagesLastHour.toLocaleString()}
          sub={`${health.activity.activeUsersLastHour} active users`}
          icon={<Activity />}
        />
        <StatCard
          title="Task failures (24h)"
          value={`${health.scheduledTasks.failed24h}/${health.scheduledTasks.runs24h}`}
          sub={`${health.scheduledTasks.stuck} stuck runs`}
          icon={<CalendarClock />}
          featured={health.scheduledTasks.failed24h > 0}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Services</CardTitle>
            <CardDescription>
              Refreshes every 30 seconds · checked{' '}
              {formatRelative(health.checkedAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>PostgreSQL</span>
              <StatusPill ok={health.database.ok} />
            </div>
            <div className="flex items-center justify-between">
              <span>Redis</span>
              <StatusPill ok={health.redis.ok} />
            </div>
            <div className="flex items-center justify-between">
              <span>Job broker</span>
              <span className="text-muted-foreground">
                {health.broker.rabbitmq
                  ? 'RabbitMQ'
                  : health.broker.redisStream
                    ? 'Redis stream'
                    : 'In-process threads'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent task failures</CardTitle>
            <CardDescription>
              Scheduled task runs, last 24 hours
            </CardDescription>
          </CardHeader>
          <CardContent>
            {health.scheduledTasks.recentFailures.length ? (
              <ul className="space-y-3 text-sm">
                {health.scheduledTasks.recentFailures.map((failure) => (
                  <li key={failure.id}>
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">{failure.taskName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelative(failure.ranAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 font-mono text-xs text-destructive">
                      {failure.error || 'No error message'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No failures in the last 24 hours
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
