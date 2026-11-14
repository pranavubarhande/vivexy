'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@vivexy/ui/button';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@vivexy/ui/form';
import type { AnalysisQuestionInput } from '../../types/analysis';

export const questionSchema = z.object({
  label: z.string().trim().min(1, 'Name the column').max(120),
  prompt: z.string().trim().min(1, 'Ask a question').max(1000),
});

interface QuestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  initial?: AnalysisQuestionInput;
  isPending?: boolean;
  onSubmit: (question: AnalysisQuestionInput) => void;
}

export const QuestionDialog = ({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initial,
  isPending,
  onSubmit,
}: QuestionDialogProps) => {
  const form = useForm<AnalysisQuestionInput>({
    resolver: zodResolver(questionSchema),
    defaultValues: initial ?? { label: '', prompt: '' },
  });

  useEffect(() => {
    if (open) form.reset(initial ?? { label: '', prompt: '' });
  }, [open, initial, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            id="analysis-question-form"
          >
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Column name</FormLabel>
                  <FormControl>
                    <Input placeholder="Governing law" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Which jurisdiction's law governs this agreement?"
                      {...field}
                    />
                  </FormControl>
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
            form="analysis-question-form"
            disabled={isPending}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
