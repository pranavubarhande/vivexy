'use client';

import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Play } from 'lucide-react';
import { Button } from '@vivexy/ui/button';
import { Input } from '@vivexy/ui/input';
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
import { useModels } from '../../hooks/useChat';
import { useStartWorkflow } from '../../hooks/useWorkflows';
import { getApiErrorMessage } from '../../lib/admin-format';
import { emptyFieldValues, fieldValuesSchema } from '../../lib/prompts';
import type { AnalysisScope } from '../../types/analysis';
import type { StoredDocument } from '../../types/document';
import type { WorkflowDefinition, WorkflowRun } from '../../types/workflow';
import { DocumentPicker } from '../analyses/document-picker';
import { PromptFieldInputs } from '../prompts/prompt-field-inputs';

const DEFAULT_MODEL_NAME = 'Gemini 2.5 Flash';

const buildSchema = (definition: WorkflowDefinition) =>
  z.object({
    title: z.string().max(255),
    documentIds: z
      .array(z.string())
      .max(
        definition.maxDocuments,
        `Choose at most ${definition.maxDocuments} documents`
      )
      .refine(
        (ids) => definition.documents !== 'required' || ids.length > 0,
        'Choose at least one document'
      ),
    values: fieldValuesSchema(definition.inputs),
    modelId: z.string().min(1, 'Choose a model'),
  });

type StartFormData = z.infer<ReturnType<typeof buildSchema>>;

interface StartWorkflowDialogProps {
  definition: WorkflowDefinition | null;
  onOpenChange: (open: boolean) => void;
  scope: AnalysisScope;
  documents: StoredDocument[];
  onStarted: (run: WorkflowRun) => void;
}

export const StartWorkflowDialog = ({
  definition,
  onOpenChange,
  scope,
  documents,
  onStarted,
}: StartWorkflowDialogProps) => {
  const { models } = useModels();
  const startWorkflow = useStartWorkflow();
  const schema = useMemo(
    () => (definition ? buildSchema(definition) : z.any()),
    [definition]
  );
  const defaultModelId =
    models.find((model) => model.name === DEFAULT_MODEL_NAME)?.id ??
    models[0]?.id ??
    '';
  const form = useForm<StartFormData>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', documentIds: [], values: {}, modelId: '' },
  });
  const selectedIds = useWatch({ control: form.control, name: 'documentIds' });

  useEffect(() => {
    if (!definition) return;
    form.reset({
      title: '',
      documentIds: [],
      values: emptyFieldValues(definition.inputs),
      modelId: form.getValues('modelId'),
    });
  }, [definition, form]);

  useEffect(() => {
    if (definition && !form.getValues('modelId') && defaultModelId) {
      form.setValue('modelId', defaultModelId);
    }
  }, [definition, defaultModelId, form]);

  if (!definition) return null;

  const onSubmit = (data: StartFormData) =>
    startWorkflow.mutate(
      {
        ...scope,
        workflowKey: definition.key,
        title: data.title.trim() || undefined,
        documentIds: data.documentIds,
        inputs: data.values,
        modelId: data.modelId,
      },
      {
        onSuccess: (run) => {
          onStarted(run);
          onOpenChange(false);
        },
        onError: (error) =>
          toast.error(
            getApiErrorMessage(error, 'Could not start the workflow')
          ),
      }
    );

  return (
    <Dialog open={!!definition} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{definition.name}</DialogTitle>
          <DialogDescription>{definition.description}</DialogDescription>
        </DialogHeader>
        <ol className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          {definition.steps.map((step, index) => (
            <li
              key={step.key}
              className="rounded-full border border-border px-2 py-0.5"
            >
              {index + 1}. {step.title}
            </li>
          ))}
        </ol>
        <Form {...form}>
          <form
            id="start-workflow-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder={definition.name} {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <PromptFieldInputs
              control={form.control}
              fields={definition.inputs}
              name="values"
            />
            {definition.documents !== 'none' && (
              <FormField
                control={form.control}
                name="documentIds"
                render={() => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>
                        Documents
                        {definition.documents === 'optional' && (
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            (optional)
                          </span>
                        )}
                      </FormLabel>
                      <span className="text-xs text-muted-foreground">
                        {selectedIds.length} selected · up to{' '}
                        {definition.maxDocuments}
                      </span>
                    </div>
                    {definition.documentsHint && (
                      <FormDescription>
                        {definition.documentsHint}
                      </FormDescription>
                    )}
                    <DocumentPicker
                      documents={documents}
                      selectedIds={selectedIds}
                      onChange={(documentIds) =>
                        form.setValue('documentIds', documentIds, {
                          shouldValidate: form.formState.isSubmitted,
                        })
                      }
                    />
                    <FormMessage />
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
                    Runs in the background. Steps marked “check” pause so you
                    can review them.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="start-workflow-form"
            disabled={startWorkflow.isPending}
          >
            <Play className="size-3.5" />
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
