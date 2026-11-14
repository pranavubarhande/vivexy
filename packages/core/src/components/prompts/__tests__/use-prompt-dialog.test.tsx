import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { UsePromptDialog } from '../use-prompt-dialog';
import { promptsService } from '../../../services/prompts.service';
import type { SavedPrompt } from '../../../types/prompt';

vi.mock('../../../services/prompts.service', () => ({
  promptsService: { render: vi.fn() },
}));

const PROMPT: SavedPrompt = {
  id: 'p1',
  source: 'personal',
  title: 'Client update',
  description: 'A short update',
  category: 'Letters',
  body: 'Write an update for {{client}}.',
  fields: [
    {
      key: 'client',
      label: 'Client',
      type: 'text',
      required: true,
      options: [],
      placeholder: 'Acme',
    },
  ],
  teamId: null,
  ownerId: 'u1',
  canEdit: true,
  useCount: 0,
  updatedAt: null,
};

const renderDialog = (onRun = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <UsePromptDialog prompt={PROMPT} onOpenChange={vi.fn()} onRun={onRun} />
    </QueryClientProvider>
  );
  return onRun;
};

describe('UsePromptDialog', () => {
  it('previews the filled prompt and runs the rendered text', async () => {
    vi.mocked(promptsService.render).mockResolvedValue(
      'Write an update for Globex.'
    );
    const onRun = renderDialog();

    fireEvent.change(screen.getByLabelText('Client'), {
      target: { value: 'Globex' },
    });
    expect(screen.getByTestId('prompt-preview').textContent).toBe(
      'Write an update for Globex.'
    );
    fireEvent.click(screen.getByRole('button', { name: /Run in chat/ }));

    await waitFor(() =>
      expect(onRun).toHaveBeenCalledWith('Write an update for Globex.')
    );
    expect(vi.mocked(promptsService.render).mock.calls[0][0]).toEqual({
      promptId: 'p1',
      values: { client: 'Globex' },
    });
  });

  it('requires the fields to be filled in', async () => {
    const onRun = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /Run in chat/ }));
    expect(await screen.findByText('Fill in Client')).toBeTruthy();
    expect(onRun).not.toHaveBeenCalled();
  });
});
