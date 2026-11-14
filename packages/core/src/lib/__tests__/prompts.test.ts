import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fieldValuesSchema,
  fillPrompt,
  placeholderKeys,
  queuePromptForChat,
  syncFields,
  takeQueuedPrompt,
} from '../prompts';
import type { PromptField } from '../../types/prompt';

const TONE: PromptField = {
  key: 'tone',
  label: 'Tone',
  type: 'choice',
  required: true,
  options: ['warm', 'brief'],
  placeholder: '',
};

describe('prompt fields', () => {
  it('finds each placeholder once, in order', () => {
    expect(placeholderKeys('Hi {{client}}, {{ tone }} and {{client}}')).toEqual(
      ['client', 'tone']
    );
  });

  it('keeps existing fields and adds new placeholders as text fields', () => {
    const fields = syncFields('Write a {{tone}} note to {{client_name}}', [
      TONE,
    ]);
    expect(fields[0]).toBe(TONE);
    expect(fields[1]).toMatchObject({
      key: 'client_name',
      label: 'Client name',
      type: 'text',
      required: true,
    });
    expect(syncFields('No fields now', fields)).toEqual([]);
  });

  it('fills a prompt and validates values', () => {
    expect(fillPrompt('A {{tone}} note', { tone: 'warm' })).toBe('A warm note');
    const schema = fieldValuesSchema([TONE]);
    expect(schema.safeParse({ tone: 'warm' }).success).toBe(true);
    expect(schema.safeParse({ tone: '' }).error?.issues[0].message).toBe(
      'Fill in Tone'
    );
    expect(schema.safeParse({ tone: 'angry' }).error?.issues[0].message).toBe(
      'Choose one of the options for Tone'
    );
  });
});

describe('queued prompts', () => {
  afterEach(() => vi.useRealTimers());

  it('are taken once', () => {
    queuePromptForChat('Summarize the lease');
    expect(takeQueuedPrompt()).toBe('Summarize the lease');
    expect(takeQueuedPrompt()).toBeNull();
  });

  it('expire after a minute', () => {
    vi.useFakeTimers();
    queuePromptForChat('Old prompt');
    vi.advanceTimersByTime(61_000);
    expect(takeQueuedPrompt()).toBeNull();
  });
});
