'use client';

import { useState } from 'react';
import {
  useCostSummary,
  useCostByModel,
  useDailyUsage,
} from '@vivexy/core/hooks/useCostManager';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@vivexy/ui/card';
import { PageContainer, PageHeader } from '@vivexy/ui/page-header';
import { cn } from '@vivexy/ui/utils';
import { Skeleton } from '@vivexy/ui/skeleton';
import { Coins, Zap, MessageSquare, TrendingUp, BarChart3 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = {
  tokens: (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  },
  cost: (n: number) => {
    if (n === 0) return '$0.00';
    if (n < 0.0001) return '<$0.0001';
    if (n < 0.01) return `$${n.toFixed(5)}`;
    if (n < 1) return `$${n.toFixed(4)}`;
    return `$${n.toFixed(2)}`;
  },
  date: (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },
};

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  loading?: boolean;
  featured?: boolean;
}

function StatCard({
  title,
  value,
  sub,
  icon,
  loading,
  featured,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        'relative overflow-hidden p-5',
        featured &&
          'border-transparent bg-night text-white ring-1 ring-white/10'
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
            featured
              ? 'bg-lime text-lime-foreground'
              : 'bg-muted text-foreground'
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
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/60 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-full px-3.5 py-1 text-sm font-medium capitalize transition-all',
            value === o.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily bar chart
// ---------------------------------------------------------------------------

interface DailyBarChartProps {
  data: { date: string; totalTokens: number; totalCostUsd: number }[];
  metric: 'tokens' | 'cost';
}

function DailyBarChart({ data, metric }: DailyBarChartProps) {
  const values = data.map((d) =>
    metric === 'tokens' ? d.totalTokens : d.totalCostUsd
  );
  const max = Math.max(...values, 1);

  if (data.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        <BarChart3 className="h-5 w-5 opacity-50" />
        No usage in this period yet
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1 h-28 w-full">
      {data.map((d, i) => {
        const val = metric === 'tokens' ? d.totalTokens : d.totalCostUsd;
        const pct = max > 0 ? (val / max) * 100 : 0;
        const label = metric === 'tokens' ? fmt.tokens(val) : fmt.cost(val);

        return (
          <div
            key={d.date}
            className="flex-1 flex flex-col items-center gap-1 group cursor-default min-w-0"
            title={`${fmt.date(d.date)}: ${label}`}
          >
            <div
              className="relative w-full flex items-end"
              style={{ height: 96 }}
            >
              <div
                className="w-full rounded-t-md bg-lime/60 group-hover:bg-lime transition-all duration-150"
                style={{ height: `${Math.max(pct, 2)}%` }}
              />
              {/* Tooltip on hover */}
              <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-popover border border-border text-xs px-2 py-1 rounded shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                <div className="font-medium">{fmt.date(d.date)}</div>
                <div className="text-muted-foreground">{label}</div>
              </div>
            </div>
            {/* Show date labels only for every nth bar to avoid clutter */}
            {(data.length <= 14 || i % Math.ceil(data.length / 10) === 0) && (
              <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                {fmt.date(d.date).split(' ')[1]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider badge color
// ---------------------------------------------------------------------------

const providerColors: Record<string, string> = {
  openai: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  anthropic: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  google: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  groq: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  mistral: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  ollama: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

function ProviderBadge({ provider }: { provider: string }) {
  const cls =
    providerColors[provider.toLowerCase()] ??
    'bg-muted text-muted-foreground border-border';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls}`}
    >
      {provider}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PERIODS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

export default function CostManagerPage() {
  const [days, setDays] = useState(30);
  const [chartMetric, setChartMetric] = useState<'tokens' | 'cost'>('cost');

  const { data: summary, isLoading: summaryLoading } = useCostSummary(days);
  const { data: byModel = [], isLoading: modelLoading } = useCostByModel(days);
  const { data: daily = [], isLoading: dailyLoading } = useDailyUsage(days);

  const totalCost = summary?.totalCostUsd ?? 0;
  const totalTokens = summary?.totalTokens ?? 0;
  const msgCount = summary?.messageCount ?? 0;
  const avgCostPerMsg = msgCount > 0 ? totalCost / msgCount : 0;

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        className="mb-2"
        eyebrow="Usage"
        title="Cost manager"
        description="Token usage and spend across all your AI conversations."
        actions={
          <Segmented
            options={PERIODS.map((p) => ({ label: p.label, value: p.value }))}
            value={days}
            onChange={setDays}
          />
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Spend"
          value={fmt.cost(totalCost)}
          sub={`Last ${days} days`}
          icon={<Coins size={18} />}
          loading={summaryLoading}
          featured
        />
        <StatCard
          title="Total Tokens"
          value={fmt.tokens(totalTokens)}
          sub={`${fmt.tokens(summary?.inputTokens ?? 0)} in · ${fmt.tokens(summary?.outputTokens ?? 0)} out`}
          icon={<Zap size={18} />}
          loading={summaryLoading}
        />
        <StatCard
          title="Messages"
          value={msgCount.toLocaleString()}
          sub="AI responses tracked"
          icon={<MessageSquare size={18} />}
          loading={summaryLoading}
        />
        <StatCard
          title="Avg per Message"
          value={fmt.cost(avgCostPerMsg)}
          sub="Cost per AI response"
          icon={<TrendingUp size={18} />}
          loading={summaryLoading}
        />
      </div>

      {/* Daily chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Daily Usage</CardTitle>
              <CardDescription>
                {chartMetric === 'cost' ? 'Spend' : 'Tokens'} per day over the
                last {days} days
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
          {dailyLoading ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            <DailyBarChart data={daily} metric={chartMetric} />
          )}
        </CardContent>
      </Card>

      {/* Per-model breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Usage by Model</CardTitle>
          <CardDescription>
            Token consumption and cost broken down by model
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {modelLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : byModel.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No usage data for this period
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium">Model</th>
                    <th className="text-right px-4 py-3 font-medium">
                      Messages
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      Input tokens
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      Output tokens
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      Total tokens
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      Input cost
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      Output cost
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      Total cost
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map((row, i) => {
                    const sharePct =
                      totalCost > 0 ? (row.totalCostUsd / totalCost) * 100 : 0;
                    return (
                      <tr
                        key={`${row.modelName}-${i}`}
                        className="border-b last:border-0 hover:bg-muted/40 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <ProviderBadge provider={row.provider} />
                            <span
                              className="font-medium truncate max-w-[160px]"
                              title={row.modelName}
                            >
                              {row.modelName}
                            </span>
                            {sharePct > 5 && (
                              <span className="text-[10px] text-muted-foreground">
                                {sharePct.toFixed(0)}%
                              </span>
                            )}
                          </div>
                          {/* Cost share bar */}
                          <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden w-full max-w-[200px]">
                            <div
                              className="h-full bg-lime rounded-full"
                              style={{ width: `${sharePct}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {row.messageCount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {fmt.tokens(row.inputTokens)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {fmt.tokens(row.outputTokens)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {fmt.tokens(row.totalTokens)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {fmt.cost(row.inputCostUsd)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {fmt.cost(row.outputCostUsd)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {fmt.cost(row.totalCostUsd)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals footer */}
                {byModel.length > 1 && (
                  <tfoot>
                    <tr className="border-t bg-muted/30 text-xs font-medium">
                      <td className="px-4 py-2.5 text-muted-foreground">
                        Total
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {msgCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {fmt.tokens(summary?.inputTokens ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {fmt.tokens(summary?.outputTokens ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {fmt.tokens(totalTokens)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {fmt.cost(summary?.inputCostUsd ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {fmt.cost(summary?.outputCostUsd ?? 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {fmt.cost(totalCost)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cost note */}
      <p className="mx-auto max-w-3xl text-xs leading-relaxed text-muted-foreground text-center pb-2">
        Token counts include <strong>all LLM calls</strong> per message — tool
        calls (e.g. Set Chat Title, web search) each consume tokens in addition
        to the final response. Input tokens include the full system prompt and
        conversation history sent on each call. Costs are estimates based on
        per-model pricing; free/local models show $0.
      </p>
    </PageContainer>
  );
}
