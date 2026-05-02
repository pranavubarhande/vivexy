'use client';

import { useState } from 'react';
import { cn } from '@/utils/common';
import { Loader2, Send, Star } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types (mirrors ask_user_tool.py QuestionField)
// ---------------------------------------------------------------------------

export interface FormQuestionField {
  id: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'select'
    | 'multiselect'
    | 'date'
    | 'boolean'
    | 'rating';
  description?: string | null;
  required?: boolean;
  options?: string[] | null;
  placeholder?: string | null;
  default?: string | null;
}

export interface FormQuestionRequest {
  request_id: string;
  title: string;
  description?: string | null;
  questions: FormQuestionField[];
}

interface FormQuestionCardProps {
  request: FormQuestionRequest;
  onSubmit: (
    requestId: string,
    answers: Record<string, unknown>
  ) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Individual field renderers
// ---------------------------------------------------------------------------

function TextField({
  field,
  value,
  onChange,
}: {
  field: FormQuestionField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type={
        field.type === 'number'
          ? 'number'
          : field.type === 'date'
            ? 'date'
            : 'text'
      }
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder ?? ''}
      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
    />
  );
}

function TextareaField({
  field,
  value,
  onChange,
}: {
  field: FormQuestionField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder ?? ''}
      rows={3}
      className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none transition-colors"
    />
  );
}

function SelectField({
  field,
  value,
  onChange,
}: {
  field: FormQuestionField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(field.options ?? []).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            'px-3 py-1.5 text-sm rounded-full border transition-colors',
            value === opt
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border bg-background hover:bg-muted/50 text-foreground'
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function MultiSelectField({
  field,
  value,
  onChange,
}: {
  field: FormQuestionField;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    onChange(
      value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]
    );
  };
  return (
    <div className="flex flex-wrap gap-2">
      {(field.options ?? []).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={cn(
            'px-3 py-1.5 text-sm rounded-full border transition-colors',
            value.includes(opt)
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border bg-background hover:bg-muted/50 text-foreground'
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function BooleanField({
  value,
  onChange,
}: {
  field: FormQuestionField;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-3">
      {[true, false].map((bool) => (
        <button
          key={String(bool)}
          type="button"
          onClick={() => onChange(bool)}
          className={cn(
            'px-5 py-2 text-sm rounded-full border transition-colors font-medium',
            value === bool
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border bg-background hover:bg-muted/50 text-foreground'
          )}
        >
          {bool ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  );
}

function RatingField({
  value,
  onChange,
}: {
  field: FormQuestionField;
  value: number | null;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(null)}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <Star
            size={24}
            className={cn(
              'transition-colors',
              (hovered ?? value ?? 0) >= star
                ? 'fill-amber-400 text-amber-400'
                : 'fill-none text-muted-foreground/30'
            )}
          />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function FormQuestionCard({ request, onSubmit }: FormQuestionCardProps) {
  const initValues = () => {
    const vals: Record<string, unknown> = {};
    for (const q of request.questions) {
      if (q.type === 'multiselect') vals[q.id] = q.default ? [q.default] : [];
      else if (q.type === 'boolean') vals[q.id] = null;
      else if (q.type === 'rating') vals[q.id] = null;
      else vals[q.id] = q.default ?? '';
    }
    return vals;
  };

  const [values, setValues] = useState<Record<string, unknown>>(initValues);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (id: string, val: unknown) => {
    setValues((prev) => ({ ...prev, [id]: val }));
    setErrors((prev) => ({ ...prev, [id]: '' }));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    for (const q of request.questions) {
      if (!q.required) continue;
      const v = values[q.id];
      if (q.type === 'multiselect' && (v as string[]).length === 0)
        errs[q.id] = 'Required';
      else if (q.type === 'boolean' && v === null) errs[q.id] = 'Required';
      else if (q.type === 'rating' && v === null) errs[q.id] = 'Required';
      else if (typeof v === 'string' && v.trim() === '')
        errs[q.id] = 'Required';
    }
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(request.request_id, values);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="my-3 rounded-xl border border-border bg-card shadow-sm overflow-hidden max-w-2xl">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">
          {request.title}
        </h3>
        {request.description && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {request.description}
          </p>
        )}
      </div>

      {/* Questions */}
      <div className="px-5 py-4 space-y-5">
        {request.questions.map((q) => (
          <div key={q.id}>
            <label className="block text-sm font-medium text-foreground mb-1">
              {q.label}
              {q.required && <span className="text-destructive ml-1">*</span>}
            </label>
            {q.description && (
              <p className="text-xs text-muted-foreground mb-1.5">
                {q.description}
              </p>
            )}

            {(q.type === 'text' ||
              q.type === 'number' ||
              q.type === 'date') && (
              <TextField
                field={q}
                value={values[q.id] as string}
                onChange={(v) => set(q.id, v)}
              />
            )}
            {q.type === 'textarea' && (
              <TextareaField
                field={q}
                value={values[q.id] as string}
                onChange={(v) => set(q.id, v)}
              />
            )}
            {q.type === 'select' && (
              <SelectField
                field={q}
                value={values[q.id] as string}
                onChange={(v) => set(q.id, v)}
              />
            )}
            {q.type === 'multiselect' && (
              <MultiSelectField
                field={q}
                value={values[q.id] as string[]}
                onChange={(v) => set(q.id, v)}
              />
            )}
            {q.type === 'boolean' && (
              <BooleanField
                field={q}
                value={values[q.id] as boolean | null}
                onChange={(v) => set(q.id, v)}
              />
            )}
            {q.type === 'rating' && (
              <RatingField
                field={q}
                value={values[q.id] as number | null}
                onChange={(v) => set(q.id, v)}
              />
            )}

            {errors[q.id] && (
              <p className="text-xs text-destructive mt-1">{errors[q.id]}</p>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border bg-muted/10 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
