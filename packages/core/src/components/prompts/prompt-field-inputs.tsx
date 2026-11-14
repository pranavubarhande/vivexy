'use client';

import type { Control, FieldValues, Path } from 'react-hook-form';
import { Input } from '@vivexy/ui/input';
import { Textarea } from '@vivexy/ui/textarea';
import {
  FormControl,
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
import type { PromptField } from '../../types/prompt';

interface PromptFieldInputsProps<TForm extends FieldValues> {
  control: Control<TForm>;
  fields: PromptField[];
  /** Where the values live in the form, e.g. "values". */
  name: string;
}

/** Inputs for a prompt's or workflow's fill-in fields inside a parent form. */
export const PromptFieldInputs = <TForm extends FieldValues>({
  control,
  fields,
  name,
}: PromptFieldInputsProps<TForm>) => (
  <>
    {fields.map((promptField) => (
      <FormField
        key={promptField.key}
        control={control}
        name={`${name}.${promptField.key}` as Path<TForm>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              {promptField.label}
              {!promptField.required && (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  (optional)
                </span>
              )}
            </FormLabel>
            {promptField.type === 'choice' ? (
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger aria-label={promptField.label}>
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {promptField.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <FormControl>
                {promptField.type === 'long_text' ? (
                  <Textarea
                    rows={4}
                    placeholder={promptField.placeholder}
                    aria-label={promptField.label}
                    {...field}
                  />
                ) : (
                  <Input
                    placeholder={promptField.placeholder}
                    aria-label={promptField.label}
                    {...field}
                  />
                )}
              </FormControl>
            )}
            <FormMessage />
          </FormItem>
        )}
      />
    ))}
  </>
);
