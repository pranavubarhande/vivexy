import { z } from 'zod';
import type { PromptField } from '../types/prompt';

/** Mirrors PLACEHOLDER in agents_core/schemas/prompt.py. */
const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;
const PENDING_PROMPT_KEY = 'vivexy:pending-prompt';
const PENDING_PROMPT_MAX_AGE_MS = 60_000;

export const placeholderKeys = (body: string): string[] => [
  ...new Set([...body.matchAll(PLACEHOLDER)].map((match) => match[1])),
];

export const labelFromKey = (key: string) => {
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Fields that match the body's placeholders, keeping what the user already
 * set up for placeholders that are still there. */
export const syncFields = (
  body: string,
  fields: PromptField[]
): PromptField[] => {
  const existing = new Map(fields.map((field) => [field.key, field]));
  return placeholderKeys(body).map(
    (key) =>
      existing.get(key) ?? {
        key,
        label: labelFromKey(key),
        type: 'text',
        required: true,
        options: [],
        placeholder: '',
      }
  );
};

export const fillPrompt = (body: string, values: Record<string, string>) =>
  body.replace(PLACEHOLDER, (_match, key: string) => values[key] ?? '').trim();

/** zod schema for the values of a set of fill-in fields. */
export const fieldValuesSchema = (fields: PromptField[]) =>
  z.object(
    Object.fromEntries(
      fields.map((field) => {
        let schema = z.string();
        if (field.required)
          schema = schema.trim().min(1, `Fill in ${field.label}`);
        if (field.type === 'choice' && field.options.length)
          schema = schema.refine(
            (value) => !value || field.options.includes(value),
            `Choose one of the options for ${field.label}`
          );
        return [field.key, schema];
      })
    )
  );

export const emptyFieldValues = (fields: PromptField[]) =>
  Object.fromEntries(fields.map((field) => [field.key, '']));

/** Hands a prompt to the chat screen, which sends it once it has loaded. */
export const queuePromptForChat = (text: string) => {
  try {
    sessionStorage.setItem(
      PENDING_PROMPT_KEY,
      JSON.stringify({ text, queuedAt: Date.now() })
    );
  } catch {
    // Private mode or storage disabled: the chat simply starts empty.
  }
};

/** The prompt queued for the chat in the last minute, if any. Taking it
 * clears it, so it is sent once. */
export const takeQueuedPrompt = (): string | null => {
  try {
    const stored = sessionStorage.getItem(PENDING_PROMPT_KEY);
    sessionStorage.removeItem(PENDING_PROMPT_KEY);
    if (!stored) return null;
    const { text, queuedAt } = JSON.parse(stored) as {
      text: string;
      queuedAt: number;
    };
    return Date.now() - queuedAt <= PENDING_PROMPT_MAX_AGE_MS ? text : null;
  } catch {
    return null;
  }
};
