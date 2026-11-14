'use client';

import { CalendarRange, FileText, Table2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ANALYSIS_KIND_LABELS, progressPercent } from '../../lib/analyses';
import type { AnalysisKind, AnalysisSummary } from '../../types/analysis';
import { AnalysisStatusBadge } from './analysis-status-badge';

const KIND_ICONS: Record<AnalysisKind, typeof Table2> = {
  review: Table2,
  summary: FileText,
  timeline: CalendarRange,
};

interface AnalysisListProps {
  analyses: AnalysisSummary[];
  onOpen: (analysisId: string) => void;
}

export const AnalysisList = ({ analyses, onOpen }: AnalysisListProps) => (
  <ul
    data-testid="analysis-list"
    className="divide-y divide-border rounded-lg border border-border bg-card"
  >
    {analyses.map((analysis) => {
      const Icon = KIND_ICONS[analysis.kind];
      const active =
        analysis.status === 'queued' || analysis.status === 'running';
      return (
        <li key={analysis.id}>
          <button
            type="button"
            onClick={() => onOpen(analysis.id)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {analysis.title}
              </span>
              <span className="block text-xs text-muted-foreground">
                {ANALYSIS_KIND_LABELS[analysis.kind]} ·{' '}
                {analysis.documentIds.length} document
                {analysis.documentIds.length === 1 ? '' : 's'}
                {analysis.kind === 'review' &&
                  ` · ${analysis.questions.length} question${analysis.questions.length === 1 ? '' : 's'}`}
                {analysis.createdAt &&
                  ` · ${formatDistanceToNow(new Date(`${analysis.createdAt}Z`), { addSuffix: true })}`}
              </span>
            </span>
            {active && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {progressPercent(analysis.progress)}%
              </span>
            )}
            <AnalysisStatusBadge status={analysis.status} />
          </button>
        </li>
      );
    })}
  </ul>
);
