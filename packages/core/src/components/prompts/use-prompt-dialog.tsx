'use client';

import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Play } from 'lucide-react';
import { Button } from '@vivexy/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vivexy/ui/dialog';
import { Form } from '@vivexy/ui/form';
import { useRenderPrompt } from '../../hooks/usePrompts';
import { getApiErrorMessage } from '../../lib/admin-format';
import {
  emptyFieldValues,
  fieldValuesSchema,
  fillPrompt,
} from '../../lib/prompts';
import type { SavedPrompt } from '../../types/prompt';
import { PromptFieldInputs } from './prompt-field-inputs';

interface UsePromptDialogProps {
  prompt: SavedPrompt | null;
  onOpenChange: (open: boolean) => void;
  onRun: (text: string) => void;
  runLabel?: string;
}

/** Fill in a prompt's fields, preview it, and send it to the assistant. */
export const UsePromptDialog = ({
  prompt,
  onOpenChange,
  onRun,
  runLabel = 'Run in chat',
}: UsePromptDialogProps) => {
  const fields = useMemo(() => prompt?.fields ?? [], [prompt]);
  const schema = useMemo(
    () => z.object({ values: fieldValuesSchema(fields) }),
    [fields]
  );
  const form = useForm<{ values: Record<string, string> }>({
    resolver: zodResolver(schema),
    defaultValues: { values: emptyFieldValues(fields) },
  });
  const values = useWatch({ control: form.control, name: 'values' });
  const renderPrompt = useRenderPrompt();

  useEffect(() => {
    form.reset({ values: emptyFieldValues(fields) });
  }, [fields, form]);

  if (!prompt) return null;

  const onSubmit = ({ values: filled }: { values: Record<string, string> }) =>
    renderPrompt.mutate(
      { promptId: prompt.id, values: filled },
      {
        onSuccess: (text) => {
          onRun(text);
          onOpenChange(false);
        },
        onError: (error) =>
          toast.error(getApiErrorMessage(error, 'Could not use this prompt')),
      }
    );

  return (
    <Dialog open={!!prompt} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{prompt.title}</DialogTitle>
          {prompt.description && (
            <DialogDescription>{prompt.description}</DialogDescription>
          )}
        </DialogHeader>
        <Form {...form}>
          <form
            id="use-prompt-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <PromptFieldInputs
              control={form.control}
              fields={fields}
              name="values"
            />
          </form>
        </Form>
        <div>
          <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Preview
          </p>
          <p
            data-testid="prompt-preview"
            className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap"
          >
            {fillPrompt(prompt.body, values ?? {})}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="use-prompt-form"
            disabled={renderPrompt.isPending}
          >
            <Play className="size-3.5" />
            {runLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
