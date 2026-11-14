'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@vivexy/ui/button';
import { Checkbox } from '@vivexy/ui/checkbox';
import { Input } from '@vivexy/ui/input';
import { Textarea } from '@vivexy/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vivexy/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@vivexy/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vivexy/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@vivexy/ui/tabs';
import { useModels } from '../../hooks/useChat';
import { useCreateAnalysis } from '../../hooks/useAnalyses';
import { getApiErrorMessage } from '../../lib/admin-format';
import {
  ANALYSIS_KIND_LABELS,
  ANALYSIS_MAX_DOCUMENTS,
  ANALYSIS_MAX_QUESTIONS,
} from '../../lib/analyses';
import type {
  Analysis,
  AnalysisKind,
  AnalysisQuestionInput,
  AnalysisScope,
} from '../../types/analysis';
import type { StoredDocument } from '../../types/document';
import { questionSchema } from './question-dialog';

const DEFAULT_MODEL_NAME = 'Gemini 2.5 Flash';

const KIND_DESCRIPTIONS: Record<AnalysisKind, string> = {
  review:
    'Ask the same questions of every document. Each answer cites its source.',
  summary: 'A cited summary of each document.',
  timeline: 'Dated events from every document, merged into one chronology.',
};

const analysisSchema = z
  .object({
    kind: z.enum(['review', 'summary', 'timeline']),
    title: z.string().max(255),
    documentIds: z.array(z.string()).min(1, 'Choose at least one document'),
    questions: z.array(questionSchema).max(ANALYSIS_MAX_QUESTIONS),
    length: z.enum(['short', 'detailed']),
    modelId: z.string().min(1, 'Choose a model'),
  })
  .superRefine((data, context) => {
    const limit = ANALYSIS_MAX_DOCUMENTS[data.kind];
    if (data.documentIds.length > limit) {
      context.addIssue({
        code: 'custom',
        path: ['documentIds'],
        message: `A ${ANALYSIS_KIND_LABELS[data.kind].toLowerCase()} can cover at most ${limit} documents`,
      });
    }
    if (data.kind === 'review' && data.questions.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'Add at least one question',
      });
    }
  });

type AnalysisFormData = z.infer<typeof analysisSchema>;

const EMPTY_QUESTION: AnalysisQuestionInput = { label: '', prompt: '' };

interface NewAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: AnalysisScope;
  documents: StoredDocument[];
  initialKind?: AnalysisKind;
  questionPresets?: AnalysisQuestionInput[];
  onCreated: (analysis: Analysis) => void;
}

export const NewAnalysisDialog = ({
  open,
  onOpenChange,
  scope,
  documents,
  initialKind = 'review',
  questionPresets = [],
  onCreated,
}: NewAnalysisDialogProps) => {
  const { models } = useModels();
  const createAnalysis = useCreateAnalysis();
  const [documentFilter, setDocumentFilter] = useState('');
  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === 'ready'),
    [documents]
  );
  const defaultModelId =
    models.find((model) => model.name === DEFAULT_MODEL_NAME)?.id ??
    models[0]?.id ??
    '';

  const form = useForm<AnalysisFormData>({
    resolver: zodResolver(analysisSchema),
    defaultValues: {
      kind: initialKind,
      title: '',
      documentIds: [],
      questions: [EMPTY_QUESTION],
      length: 'short',
      modelId: defaultModelId,
    },
  });
  const questions = useFieldArray({ control: form.control, name: 'questions' });
  const kind = useWatch({ control: form.control, name: 'kind' });
  const selectedIds = useWatch({ control: form.control, name: 'documentIds' });

  useEffect(() => {
    if (!open) return;
    form.reset({
      kind: initialKind,
      title: '',
      documentIds: [],
      questions: [EMPTY_QUESTION],
      length: 'short',
      modelId: form.getValues('modelId'),
    });
  }, [open, initialKind, form]);

  const handleOpenChange = (next: boolean) => {
    if (!next) setDocumentFilter('');
    onOpenChange(next);
  };

  useEffect(() => {
    if (open && !form.getValues('modelId') && defaultModelId) {
      form.setValue('modelId', defaultModelId);
    }
  }, [open, defaultModelId, form]);

  const shownDocuments = readyDocuments.filter((document) =>
    document.filename.toLowerCase().includes(documentFilter.toLowerCase())
  );
  const allShownSelected =
    shownDocuments.length > 0 &&
    shownDocuments.every((document) => selectedIds.includes(document.id));

  const toggleDocument = (documentId: string, checked: boolean) =>
    form.setValue(
      'documentIds',
      checked
        ? [...selectedIds, documentId]
        : selectedIds.filter((id) => id !== documentId),
      { shouldValidate: form.formState.isSubmitted }
    );

  const toggleAllShown = () => {
    const shownIds = shownDocuments.map((document) => document.id);
    form.setValue(
      'documentIds',
      allShownSelected
        ? selectedIds.filter((id) => !shownIds.includes(id))
        : [...new Set([...selectedIds, ...shownIds])],
      { shouldValidate: form.formState.isSubmitted }
    );
  };

  const addPreset = (preset: AnalysisQuestionInput) => {
    const current = form.getValues('questions');
    const blank = current.findIndex((q) => !q.label.trim() && !q.prompt.trim());
    if (blank >= 0) questions.update(blank, preset);
    else if (current.length < ANALYSIS_MAX_QUESTIONS) questions.append(preset);
  };

  const onSubmit = (data: AnalysisFormData) =>
    createAnalysis.mutate(
      {
        ...scope,
        kind: data.kind,
        title: data.title.trim() || undefined,
        documentIds: data.documentIds,
        questions: data.kind === 'review' ? data.questions : undefined,
        length: data.kind === 'summary' ? data.length : undefined,
        modelId: data.modelId,
      },
      {
        onSuccess: (analysis) => {
          onCreated(analysis);
          handleOpenChange(false);
        },
        onError: (error) =>
          toast.error(
            getApiErrorMessage(error, 'Could not start the analysis')
          ),
      }
    );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New analysis</DialogTitle>
          <DialogDescription>{KIND_DESCRIPTIONS[kind]}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id="new-analysis-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-5"
          >
            <FormField
              control={form.control}
              name="kind"
              render={({ field }) => (
                <FormItem>
                  <Tabs
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <TabsList>
                      {(
                        Object.keys(ANALYSIS_KIND_LABELS) as AnalysisKind[]
                      ).map((value) => (
                        <TabsTrigger key={value} value={value}>
                          {ANALYSIS_KIND_LABELS[value]}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Supplier contracts review" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="documentIds"
              render={() => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Documents</FormLabel>
                    <span className="text-xs text-muted-foreground">
                      {selectedIds.length} selected · up to{' '}
                      {ANALYSIS_MAX_DOCUMENTS[kind]}
                    </span>
                  </div>
                  {readyDocuments.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                      No documents are ready yet. Upload some first.
                    </p>
                  ) : (
                    <div className="rounded-md border border-border">
                      <div className="flex items-center gap-2 border-b border-border p-2">
                        <Checkbox
                          checked={allShownSelected}
                          onCheckedChange={toggleAllShown}
                          aria-label="Select all shown documents"
                        />
                        <div className="relative flex-1">
                          <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={documentFilter}
                            onChange={(event) =>
                              setDocumentFilter(event.target.value)
                            }
                            placeholder="Find a document"
                            className="h-7 pl-7 text-sm"
                          />
                        </div>
                      </div>
                      <ul className="max-h-48 overflow-y-auto p-1">
                        {shownDocuments.map((document) => (
                          <li key={document.id}>
                            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                              <Checkbox
                                checked={selectedIds.includes(document.id)}
                                onCheckedChange={(checked) =>
                                  toggleDocument(document.id, checked === true)
                                }
                              />
                              <span className="truncate">
                                {document.filename}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {kind === 'review' && (
              <FormField
                control={form.control}
                name="questions"
                render={() => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Questions</FormLabel>
                      <span className="text-xs text-muted-foreground">
                        {questions.fields.length} of {ANALYSIS_MAX_QUESTIONS}
                      </span>
                    </div>
                    {questionPresets.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {questionPresets.map((preset) => (
                          <Button
                            key={preset.label}
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-6 px-2 text-xs"
                            onClick={() => addPreset(preset)}
                          >
                            <Plus className="size-3" />
                            {preset.label}
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      {questions.fields.map((question, index) => (
                        <div
                          key={question.id}
                          className="flex items-start gap-2 rounded-md border border-border p-2"
                        >
                          <div className="grid flex-1 gap-2 sm:grid-cols-[10rem_1fr]">
                            <FormField
                              control={form.control}
                              name={`questions.${index}.label`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input
                                      placeholder="Column name"
                                      aria-label={`Question ${index + 1} column name`}
                                      className="h-8 text-sm"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`questions.${index}.prompt`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Textarea
                                      rows={1}
                                      placeholder="The question to ask each document"
                                      aria-label={`Question ${index + 1}`}
                                      className="min-h-8 text-sm"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Remove question ${index + 1}`}
                            onClick={() => questions.remove(index)}
                            disabled={questions.fields.length === 1}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => questions.append(EMPTY_QUESTION)}
                      disabled={
                        questions.fields.length >= ANALYSIS_MAX_QUESTIONS
                      }
                    >
                      <Plus className="size-3.5" />
                      Add question
                    </Button>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {kind === 'summary' && (
              <FormField
                control={form.control}
                name="length"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Length</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-56">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="short">
                          Short (3–5 sentences)
                        </SelectItem>
                        <SelectItem value="detailed">
                          Detailed (every key term)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="modelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Model</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-72">
                        <SelectValue placeholder="Choose a model" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Runs in the background; you can leave this page.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="new-analysis-form"
            disabled={createAnalysis.isPending}
          >
            Start {ANALYSIS_KIND_LABELS[kind].toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
