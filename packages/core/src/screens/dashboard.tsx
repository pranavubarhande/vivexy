'use client';

import Link from 'next/link';
import {
  ArrowUpRight,
  Blocks,
  CalendarClock,
  Coins,
  MessageSquare,
  Users,
} from 'lucide-react';
import { useAppConfig } from '@vivexy/core/shared/app-config-provider';
import { ROUTES } from '@vivexy/core/constants/routes';
import { Button } from '@vivexy/ui/button';
import { PageContainer, PageHeader } from '@vivexy/ui/page-header';

const SHORTCUTS = [
  {
    href: ROUTES.scheduledTasks,
    icon: CalendarClock,
    title: 'Scheduled tasks',
    body: 'Run prompts on a schedule and review results in chat.',
  },
  {
    href: ROUTES.connectors,
    icon: Blocks,
    title: 'Integrations',
    body: 'Connect Slack, Gmail, Jira, Notion and more.',
  },
  {
    href: ROUTES.teams,
    icon: Users,
    title: 'Teams',
    body: 'Invite colleagues and share workspaces.',
  },
  {
    href: ROUTES.costManager,
    icon: Coins,
    title: 'Cost manager',
    body: 'Track tokens and spend across every model.',
  },
];

export default function DashboardPage() {
  const { appName } = useAppConfig();
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Home"
        title={`Welcome to ${appName}`}
        description="Your AI workspace for professional teams. Start a conversation, automate recurring work, or connect the tools you already use."
      />

      <Link
        href={ROUTES.chat()}
        className="group relative mb-6 flex flex-col justify-between gap-10 overflow-hidden rounded-3xl bg-night p-8 text-white md:flex-row md:items-end md:p-10"
      >
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-lime/20 blur-3xl transition-opacity group-hover:opacity-80" />
        <div className="relative max-w-lg">
          <div className="mb-6 flex size-11 items-center justify-center rounded-2xl bg-lime text-lime-foreground">
            <MessageSquare className="size-5" />
          </div>
          <h2 className="font-serif text-3xl leading-tight md:text-4xl">
            Ask anything. <span className="text-lime">Get it done.</span>
          </h2>
          <p className="mt-3 text-white/60">
            Draft documents, analyse spreadsheets and research across your
            connected tools — all in one chat.
          </p>
        </div>
        <Button
          variant="default"
          className="relative bg-lime text-lime-foreground"
          asChild
        >
          <span>
            Start a chat
            <ArrowUpRight />
          </span>
        </Button>
      </Link>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SHORTCUTS.map(({ href, icon: Icon, title, body }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-2xl border border-border/80 bg-card p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-lime group-hover:text-lime-foreground">
                <Icon className="size-5" />
              </span>
              <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
            <h3 className="mt-5 font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
