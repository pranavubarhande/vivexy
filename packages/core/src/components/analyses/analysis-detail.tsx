'use client';

import { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Loader2,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@vivexy/ui/badge';
import { Button } from '@vivexy/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@vivexy/ui/alert-dialog';
import {
  isAnalysisActive,
  useAnalysis,
  useCancelAnalysis,
  useDeleteAnalysis,
  useDownloadAnalysis,
  useRetryAnalysis,
} from '../../hooks/useAnalyses';
import { getApiErrorMessage } from '../../lib/admin-format';
import { ANALYSIS_KIND_LABELS, progressPercent } from '../../lib/analyses';
import type { Citation } from '../../types/chat';
import { CitationSourceViewer } from '../chat/citation-source-viewer';
import { ReviewGrid } from './review-grid';
import { SummaryView } from './summary-view';
import { TimelineView } from './timeline-view';
import { AnalysisStatusBadge } from './analysis-status-badge';

const EXPORT_LABELS = {
  review: 'Export to Excel',
  timeline: 'Export to Excel',
  summary: 'Export to Word',
} as const;

interface AnalysisDetailProps {
  analysisId: string;
  onBack: () => void;
}

export const AnalysisDetail = ({ analysisId, onBack }: AnalysisDetailProps) => {
  const { data: analysis, isLoading, error } = useAnalysis(analysisId);
  const [openCitation, setOpenCitation] = useState<Citation | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cancel = useCancelAnalysis();
  const retry = useRetryAnalysis();
  const remove = useDeleteAnalysis();
  const download = useDownloadAnalysis();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading analysis…
      </div>
    );
  }
  if (error || !analysis) {
    return (
      <div className="space-y-3 py-16 text-center text-sm text-muted-foreground">
        <p>This analysis could not be found.</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          Back to analyses
        </Button>
      </div>
    );
  }

  const active = isAnalysisActive(analysis.status);
  const percent = progressPercent(analysis.progress);
  const onError = (fallback: string) => (mutationError: unknown) =>
    toast.error(getApiErrorMessage(mutationError, fallback));

  return (
    <div className="space-y-4" data-testid="analysis-detail">
      <div className="flex flex-wrap items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onBack}
          aria-label="Back to analyses"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{analysis.title}</h2>
            <Badge variant="muted">{ANALYSIS_KIND_LABELS[analysis.kind]}</Badge>
            <AnalysisStatusBadge status={analysis.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {analysis.documents.length} document
            {analysis.documents.length === 1 ? '' : 's'}
            {analysis.kind === 'review' &&
              ` · ${analysis.questions.length} question${analysis.questions.length === 1 ? '' : 's'}`}
            {` · ${analysis.progress.done} of ${analysis.progress.total} done`}
            {analysis.progress.failed > 0 &&
              ` · ${analysis.progress.failed} failed`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {active && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                cancel.mutate(analysis.id, {
                  onError: onError('Could not stop the analysis'),
                })
              }
            >
              <Square className="size-3.5" />
              Stop
            </Button>
          )}
          {!active && analysis.progress.failed > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                retry.mutate(analysis.id, {
                  onError: onError('Could not retry'),
                })
              }
            >
              <RotateCcw className="size-3.5" />
              Retry failed
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={download.isPending}
            onClick={() =>
              download.mutate(analysis.id, {
                onSuccess: (filename) =>
                  toast.success(`Downloaded ${filename}`),
                onError: onError('Could not export'),
              })
            }
          >
            <Download className="size-3.5" />
            {EXPORT_LABELS[analysis.kind]}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Delete analysis"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {active && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.max(percent, 3)}%` }}
          />
        </div>
      )}
      {analysis.error && !active && (
        <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="size-4" />
          {analysis.error}
        </p>
      )}

      {analysis.kind === 'review' && (
        <ReviewGrid analysis={analysis} onOpenSource={setOpenCitation} />
      )}
      {analysis.kind === 'summary' && <SummaryView analysis={analysis} />}
      {analysis.kind === 'timeline' && (
        <TimelineView analysis={analysis} onOpenSource={setOpenCitation} />
      )}

      <CitationSourceViewer
        citation={openCitation}
        onClose={() => setOpenCitation(null)}
      />
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this analysis?</AlertDialogTitle>
            <AlertDialogDescription>
              Its answers and sources are deleted. The documents stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                remove.mutate(analysis.id, {
                  onSuccess: onBack,
                  onError: onError('Could not delete the analysis'),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
