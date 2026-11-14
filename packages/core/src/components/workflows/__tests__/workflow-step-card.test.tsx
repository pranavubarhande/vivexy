import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowStepCard } from '../workflow-step-card';
import type { WorkflowRunStep } from '../../../types/workflow';

vi.mock('../../../services/documents.service', () => ({
  documentsService: { getPage: vi.fn(), getFileUrl: vi.fn() },
}));

const STEP: WorkflowRunStep = {
  key: 'issues',
  title: 'Key issues',
  kind: 'write',
  pause: true,
  description: 'Check the issues',
  status: 'done',
  output: '1. Texas law governs [^aaaaaaaa].',
  citations: [
    {
      id: 'aaaaaaaa',
      chunkId: 'c1',
      documentId: 'd1',
      filename: 'msa.pdf',
      paginated: true,
      pageNumber: 2,
      charStart: 0,
      charEnd: 10,
      quote: 'Governed by the laws of Texas.',
    },
  ],
  analysisId: null,
  edited: false,
  error: null,
  completedAt: '2026-11-14T10:00:00',
};

const renderCard = (
  overrides: Partial<WorkflowRunStep> = {},
  locked = false
) => {
  const onSave = vi.fn();
  const onRerun = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WorkflowStepCard
        step={{ ...STEP, ...overrides }}
        index={1}
        locked={locked}
        isPausePoint
        onSave={onSave}
        onRerun={onRerun}
        isSaving={false}
      />
    </QueryClientProvider>
  );
  return { onSave, onRerun };
};

describe('WorkflowStepCard', () => {
  it('shows the cited output and lets the user edit it', () => {
    const { onSave } = renderCard();
    expect(screen.getByText('2. Key issues')).toBeTruthy();
    expect(screen.getByTestId('citation-sources').textContent).toContain(
      'msa.pdf · p. 2'
    );

    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    fireEvent.change(screen.getByLabelText('Edit Key issues'), {
      target: { value: '1. Check the governing law.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('1. Check the governing law.');
  });

  it('hides actions while the run is busy', () => {
    renderCard({}, true);
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
  });

  it('shows a failed step error', () => {
    renderCard({ status: 'failed', output: null, error: 'Model unavailable' });
    expect(screen.getByText('Model unavailable')).toBeTruthy();
  });
});
