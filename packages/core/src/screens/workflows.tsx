'use client';

import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Play, Workflow } from 'lucide-react';
import { Button } from '@vivexy/ui/button';
import { EmptyState, PageContainer, PageHeader } from '@vivexy/ui/page-header';
import { StartWorkflowDialog } from '@vivexy/core/workflows/start-workflow-dialog';
import { WorkflowRunView } from '@vivexy/core/workflows/workflow-run-view';
import { WorkflowStatusBadge } from '@vivexy/core/workflows/workflow-status-badge';
import { useActiveTeam } from '@vivexy/core/hooks/useActiveTeam';
import { useScopeDocuments } from '@vivexy/core/hooks/useDocuments';
import {
  useWorkflowDefinitions,
  useWorkflowRuns,
} from '@vivexy/core/hooks/useWorkflows';
import { ROUTES } from '@vivexy/core/constants/routes';
import type { AnalysisScope } from '@vivexy/core/types/analysis';
import type { WorkflowDefinition } from '@vivexy/core/types/workflow';

const RUN_PARAM = 'run';

export interface WorkflowsScreenProps {
  scope?: AnalysisScope;
  /** Only these workflows are offered; all of them by default. */
  workflowKeys?: string[];
  analysisHref?: (analysisId: string) => string;
  eyebrow?: string;
  title?: string;
  description?: string;
}

export const WorkflowsScreen = ({
  scope,
  workflowKeys,
  analysisHref = (analysisId) => `${ROUTES.analyses}?analysis=${analysisId}`,
  eyebrow = 'Workflows',
  title = 'Guided workflows',
  description = 'Multi-step work on your documents. Each step is saved, can be checked and edited, and the run picks up where it left off.',
}: WorkflowsScreenProps) => {
  const { activeTeamId } = useActiveTeam();
  const effectiveScope: AnalysisScope = scope ?? { teamId: activeTeamId };
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const runId = searchParams.get(RUN_PARAM);
  const [starting, setStarting] = useState<WorkflowDefinition | null>(null);
  const { data: definitions = [], isLoading } = useWorkflowDefinitions();
  const { data: runs = [] } = useWorkflowRuns(effectiveScope);
  const { data: documentList } = useScopeDocuments(effectiveScope);
  const offered = workflowKeys
    ? definitions.filter((d) => workflowKeys.includes(d.key))
    : definitions;

  const openRun = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set(RUN_PARAM, id);
    else params.delete(RUN_PARAM);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  if (runId) {
    return (
      <PageContainer size="wide">
        <WorkflowRunView
          runId={runId}
          onBack={() => openRun(null)}
          analysisHref={analysisHref}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer size="wide">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading workflows…
        </div>
      ) : offered.length === 0 ? (
        <EmptyState icon={<Workflow />} title="No workflows available" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {offered.map((definition) => (
            <div
              key={definition.key}
              data-testid="workflow-card"
              className="flex flex-col rounded-lg border border-border bg-card p-4"
            >
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {definition.category}
              </p>
              <h3 className="mt-1 text-sm font-semibold">{definition.name}</h3>
              <p className="mt-1 flex-1 text-xs text-muted-foreground">
                {definition.description}
              </p>
              <p className="mt-3 text-[11px] text-muted-foreground">
                {definition.steps.map((step) => step.title).join(' → ')}
              </p>
              <Button
                size="sm"
                className="mt-3 self-start"
                onClick={() => setStarting(definition)}
              >
                <Play className="size-3.5" />
                Start
              </Button>
            </div>
          ))}
        </div>
      )}

      {runs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">Recent runs</h2>
          <ul
            data-testid="workflow-runs"
            className="divide-y divide-border rounded-lg border border-border bg-card"
          >
            {runs.map((run) => (
              <li key={run.id}>
                <button
                  type="button"
                  onClick={() => openRun(run.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {run.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {run.workflowName} · {run.progress.done} of{' '}
                      {run.progress.total} steps
                      {run.createdAt &&
                        ` · ${formatDistanceToNow(new Date(`${run.createdAt}Z`), { addSuffix: true })}`}
                    </span>
                  </span>
                  <WorkflowStatusBadge status={run.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <StartWorkflowDialog
        definition={starting}
        onOpenChange={(open) => !open && setStarting(null)}
        scope={effectiveScope}
        documents={documentList?.documents ?? []}
        onStarted={(run) => openRun(run.id)}
      />
    </PageContainer>
  );
};

export default function WorkflowsPage() {
  return (
    <Suspense>
      <WorkflowsScreen />
    </Suspense>
  );
}
