import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { NewAnalysisDialog } from '../new-analysis-dialog';

vi.mock('../../../services/chat.service', () => ({
  chatService: {
    getModels: vi
      .fn()
      .mockResolvedValue([
        { id: 'model-1', name: 'Gemini 2.5 Flash', provider: 'google' },
      ]),
  },
}));
const create = vi.fn();
vi.mock('../../../services/analyses.service', () => ({
  analysesService: { create: (...args: unknown[]) => create(...args) },
}));

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const DOCUMENT = {
  id: 'd1',
  teamId: 't1',
  scopeType: null,
  scopeId: null,
  filename: 'memo.docx',
  mimeType: 'application/msword',
  size: 1,
  status: 'ready' as const,
  stage: null,
  error: null,
  paginated: false,
  pageCount: 1,
  createdAt: null,
};

const renderDialog = (
  lockKind: boolean,
  documents = [] as (typeof DOCUMENT)[]
) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NewAnalysisDialog
        open
        onOpenChange={vi.fn()}
        scope={{ teamId: 't1' }}
        documents={documents}
        initialKind="timeline"
        lockKind={lockKind}
        onCreated={vi.fn()}
      />
    </QueryClientProvider>
  );

describe('NewAnalysisDialog', () => {
  it('offers every kind by default', () => {
    renderDialog(false);
    expect(screen.getByRole('tab', { name: 'Summary' })).toBeTruthy();
    expect(screen.getByText('New analysis')).toBeTruthy();
  });

  it('offers only the screen’s kind when locked', () => {
    renderDialog(true);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText('New timeline')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start timeline' })).toBeTruthy();
  });

  it('starts a timeline without asking for review questions', async () => {
    create.mockResolvedValue({ id: 'a1' });
    renderDialog(true, [DOCUMENT]);
    await screen.findAllByText('Gemini 2.5 Flash');
    fireEvent.click(screen.getByLabelText('Select all shown documents'));
    fireEvent.click(screen.getByRole('button', { name: 'Start timeline' }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({
      kind: 'timeline',
      documentIds: ['d1'],
      modelId: 'model-1',
      questions: undefined,
    });
  });
});
