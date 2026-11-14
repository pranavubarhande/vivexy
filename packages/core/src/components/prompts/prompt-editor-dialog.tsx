'use client';

import { useEffect } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
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
import { useCreatePrompt, useUpdatePrompt } from '../../hooks/usePrompts';
import { getApiErrorMessage } from '../../lib/admin-format';
import { syncFields } from '../../lib/prompts';
import type { SavedPrompt } from '../../types/prompt';

const FIELD_TYPE_LABELS = {
  text: 'Short text',
  long_text: 'Long text',
  choice: 'Choice',
} as const;

const promptSchema = z.object({
  title: z.string().trim().min(1, 'Give the prompt a name').max(160),
  category: z.string().max(64),
  description: z.string().max(1000),
  body: z.string().trim().min(1, 'Write the prompt').max(8000),
  visibility: z.enum(['personal', 'team']),
  fields: z
    .array(
      z
        .object({
          key: z.string(),
          label: z.string().trim().min(1, 'Add a label'),
          type: z.enum(['text', 'long_text', 'choice']),
          required: z.boolean(),
          options: z.array(z.string()),
          placeholder: z.string(),
        })
        .refine((field) => field.type !== 'choice' || field.options.length, {
          message: 'List the choices, separated by commas',
          path: ['options'],
        })
    )
    .max(12, 'A prompt can have at most 12 fields'),
});

type PromptFormData = z.infer<typeof promptSchema>;

const EMPTY: PromptFormData = {
  title: '',
  category: '',
  description: '',
  body: '',
  visibility: 'personal',
  fields: [],
};

const fromPrompt = (prompt: SavedPrompt): PromptFormData => ({
  title: prompt.title,
  category: prompt.category ?? '',
  description: prompt.description ?? '',
  body: prompt.body,
  visibility: prompt.source === 'team' ? 'team' : 'personal',
  fields: prompt.fields,
});

interface PromptEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt?: SavedPrompt | null;
  teamId?: string | null;
  canShareWithTeam: boolean;
}

export const PromptEditorDialog = ({
  open,
  onOpenChange,
  prompt,
  teamId,
  canShareWithTeam,
}: PromptEditorDialogProps) => {
  const createPrompt = useCreatePrompt();
  const updatePrompt = useUpdatePrompt();
  const form = useForm<PromptFormData>({
    resolver: zodResolver(promptSchema),
    defaultValues: EMPTY,
  });
  const fields = useFieldArray({ control: form.control, name: 'fields' });
  const fieldTypes = useWatch({ control: form.control, name: 'fields' });

  useEffect(() => {
    if (open) form.reset(prompt ? fromPrompt(prompt) : EMPTY);
  }, [open, prompt, form]);

  const handleBodyChange = (body: string) => {
    form.setValue('body', body, { shouldValidate: form.formState.isSubmitted });
    form.setValue('fields', syncFields(body, form.getValues('fields')));
  };

  const onSubmit = (data: PromptFormData) => {
    const payload = {
      ...data,
      category: data.category.trim() || undefined,
      description: data.description.trim() || undefined,
      teamId: data.visibility === 'team' ? teamId : undefined,
    };
    const options = {
      onSuccess: () => {
        toast.success(prompt ? 'Prompt saved' : 'Prompt added to the library');
        onOpenChange(false);
      },
      onError: (error: unknown) =>
        toast.error(getApiErrorMessage(error, 'Could not save the prompt')),
    };
    if (prompt) updatePrompt.mutate({ promptId: prompt.id, payload }, options);
    else createPrompt.mutate(payload, options);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{prompt ? 'Edit prompt' : 'New prompt'}</DialogTitle>
          <DialogDescription>
            Write {'{{name}}'} where the user should fill something in; a field
            appears for each one.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id="prompt-editor-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Client update letter" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input placeholder="Letters" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="What it is for" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prompt</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={6}
                      placeholder="Draft a short update to {{client}} about {{topic}}, citing the documents."
                      {...field}
                      onChange={(event) => handleBodyChange(event.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {fields.fields.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Fields</p>
                {fields.fields.map((promptField, index) => (
                  <div
                    key={promptField.id}
                    className="grid items-start gap-2 rounded-md border border-border p-2 sm:grid-cols-[7rem_1fr_9rem_auto]"
                  >
                    <code className="truncate pt-2 text-xs text-muted-foreground">
                      {`{{${promptField.key}}}`}
                    </code>
                    <FormField
                      control={form.control}
                      name={`fields.${index}.label`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              aria-label={`Label for ${promptField.key}`}
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
                      name={`fields.${index}.type`}
                      render={({ field }) => (
                        <FormItem>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger
                                className="h-8 text-sm"
                                aria-label={`Type of ${promptField.key}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(FIELD_TYPE_LABELS).map(
                                ([value, label]) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`fields.${index}.required`}
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-1.5 pt-2">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) =>
                                field.onChange(checked === true)
                              }
                            />
                          </FormControl>
                          <FormLabel className="text-xs font-normal">
                            Required
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                    {fieldTypes?.[index]?.type === 'choice' && (
                      <FormField
                        control={form.control}
                        name={`fields.${index}.options`}
                        render={({ field }) => (
                          <FormItem className="sm:col-span-4">
                            <FormControl>
                              <Input
                                aria-label={`Choices for ${promptField.key}`}
                                placeholder="Choices, separated by commas"
                                className="h-8 text-sm"
                                defaultValue={field.value.join(', ')}
                                onChange={(event) =>
                                  field.onChange(
                                    event.target.value
                                      .split(',')
                                      .map((option) => option.trim())
                                      .filter(Boolean)
                                  )
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {canShareWithTeam && !prompt && (
              <FormField
                control={form.control}
                name="visibility"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Who can use it</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-64">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="personal">Only me</SelectItem>
                        <SelectItem value="team">
                          Everyone in the team
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Team prompts can be changed only by team admins.
                    </FormDescription>
                  </FormItem>
                )}
              />
            )}
          </form>
        </Form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="prompt-editor-form"
            disabled={createPrompt.isPending || updatePrompt.isPending}
          >
            {prompt ? 'Save' : 'Add prompt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
