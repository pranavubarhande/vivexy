'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@vivexy/ui/utils';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@vivexy/ui/dropdown-menu';
import {
  useAddAnalysisQuestion,
  useRemoveAnalysisQuestion,
  useRerunAnalysisQuestion,
} from '../../hooks/useAnalyses';
import { getApiErrorMessage } from '../../lib/admin-format';
import {
  ANALYSIS_MAX_QUESTIONS,
  ReviewSort,
  reviewRows,
} from '../../lib/analyses';
import type {
  Analysis,
  AnalysisQuestion,
  AnalysisQuestionInput,
  AnalysisResult,
} from '../../types/analysis';
import type { Citation } from '../../types/chat';
import { QuestionDialog } from './question-dialog';
import { SourceChips } from './source-chips';

const ReviewCell = ({
  result,
  onOpenSource,
}: {
  result: AnalysisResult | undefined;
  onOpenSource: (citation: Citation) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!result || result.status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Reading…
      </span>
    );
  }
  if (result.status === 'failed') {
    return (
      <span className="inline-flex items-start gap-1.5 text-xs text-destructive">
        <AlertCircle className="mt-px size-3 shrink-0" />
        {result.error ?? 'Could not answer'}
      </span>
    );
  }
  if (!result.found) {
    return (
      <span
        data-testid="review-cell-not-found"
        className="text-xs text-muted-foreground italic"
      >
        Not found
      </span>
    );
  }
  return (
    <div data-testid="review-cell">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className={cn(
          'text-left text-[13px] leading-snug text-foreground',
          !expanded && 'line-clamp-4'
        )}
      >
        {result.answer}
      </button>
      <SourceChips citations={result.citations} onOpen={onOpenSource} />
    </div>
  );
};

const QuestionHeader = ({
  question,
  sort,
  onSort,
  onEdit,
  onRerun,
  onRemove,
  canRemove,
}: {
  question: AnalysisQuestion;
  sort: ReviewSort | null;
  onSort: () => void;
  onEdit: () => void;
  onRerun: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) => {
  const sorted = sort?.questionId === question.id ? sort.direction : null;
  const SortIcon =
    sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <div className="flex items-start gap-1">
      <button
        type="button"
        onClick={onSort}
        title={question.prompt}
        className="flex min-w-0 flex-1 items-start gap-1 text-left font-medium"
      >
        <span className="line-clamp-2">{question.label}</span>
        <SortIcon
          className={cn(
            'mt-0.5 size-3 shrink-0',
            sorted ? 'text-foreground' : 'text-muted-foreground/60'
          )}
        />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            aria-label={`${question.label} options`}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="size-3.5" />
            Edit and re-run
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRerun}>
            <RotateCcw className="size-3.5" />
            Re-run column
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onRemove}
            disabled={!canRemove}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Remove column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

interface ReviewGridProps {
  analysis: Analysis;
  onOpenSource: (citation: Citation) => void;
}

export const ReviewGrid = ({ analysis, onOpenSource }: ReviewGridProps) => {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<ReviewSort | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AnalysisQuestion | null>(null);
  const addQuestion = useAddAnalysisQuestion();
  const rerunQuestion = useRerunAnalysisQuestion();
  const removeQuestion = useRemoveAnalysisQuestion();

  const rows = useMemo(
    () => reviewRows(analysis, filter, sort),
    [analysis, filter, sort]
  );

  const toggleSort = (questionId: string) =>
    setSort((current) =>
      current?.questionId !== questionId
        ? { questionId, direction: 'asc' }
        : current.direction === 'asc'
          ? { questionId, direction: 'desc' }
          : null
    );

  const handleError = (fallback: string) => (error: unknown) =>
    toast.error(getApiErrorMessage(error, fallback));

  const handleAdd = (question: AnalysisQuestionInput) =>
    addQuestion.mutate(
      { analysisId: analysis.id, question },
      {
        onSuccess: () => setAdding(false),
        onError: handleError('Could not add the column'),
      }
    );

  const handleEdit = (question: AnalysisQuestionInput) =>
    editing &&
    rerunQuestion.mutate(
      { analysisId: analysis.id, questionId: editing.id, question },
      {
        onSuccess: () => setEditing(null),
        onError: handleError('Could not re-run the column'),
      }
    );

  const canAdd = analysis.questions.length < ANALYSIS_MAX_QUESTIONS;
  const editingInitial = useMemo(
    () =>
      editing ? { label: editing.label, prompt: editing.prompt } : undefined,
    [editing]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter documents and answers"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {rows.length} of {analysis.documents.length} documents
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => setAdding(true)}
          disabled={!canAdd}
          title={
            canAdd
              ? undefined
              : `A review can ask at most ${ANALYSIS_MAX_QUESTIONS} questions`
          }
        >
          <Plus className="size-3.5" />
          Add column
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table
          data-testid="review-grid"
          className="w-full border-collapse text-sm"
        >
          <thead>
            <tr className="bg-muted/50 text-xs text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-48 border-b border-r border-border bg-muted px-3 py-2 text-left font-medium">
                Document
              </th>
              {analysis.questions.map((question) => (
                <th
                  key={question.id}
                  className="min-w-56 border-b border-r border-border px-3 py-2 text-left align-top text-foreground last:border-r-0"
                >
                  <QuestionHeader
                    question={question}
                    sort={sort}
                    onSort={() => toggleSort(question.id)}
                    onEdit={() => setEditing(question)}
                    onRerun={() =>
                      rerunQuestion.mutate(
                        { analysisId: analysis.id, questionId: question.id },
                        { onError: handleError('Could not re-run the column') }
                      )
                    }
                    onRemove={() =>
                      removeQuestion.mutate(
                        { analysisId: analysis.id, questionId: question.id },
                        { onError: handleError('Could not remove the column') }
                      )
                    }
                    canRemove={analysis.questions.length > 1}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.documentId}
                className="border-b border-border last:border-b-0 hover:bg-muted/20"
              >
                <td className="sticky left-0 z-10 border-r border-border bg-background px-3 py-2 align-top text-[13px] font-medium">
                  <span
                    className={cn(
                      !row.available && 'text-muted-foreground line-through'
                    )}
                  >
                    {row.filename}
                  </span>
                </td>
                {analysis.questions.map((question) => (
                  <td
                    key={question.id}
                    className="border-r border-border px-3 py-2 align-top last:border-r-0"
                  >
                    <ReviewCell
                      result={row.cells.get(question.id)}
                      onOpenSource={onOpenSource}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={analysis.questions.length + 1}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No documents match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <QuestionDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add a column"
        description="Ask a new question of every document in this review."
        submitLabel="Add and run"
        isPending={addQuestion.isPending}
        onSubmit={handleAdd}
      />
      <QuestionDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit column"
        description="The column is answered again for every document."
        submitLabel="Save and re-run"
        initial={editingInitial}
        isPending={rerunQuestion.isPending}
        onSubmit={handleEdit}
      />
    </div>
  );
};
