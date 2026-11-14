import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { NewAnalysisDialog } from '../new-analysis-dialog';

vi.mock('../../../services/chat.service', () => ({
  chatService: { getModels: vi.fn().mockResolvedValue([]) },
}));
vi.mock('../../../services/analyses.service', () => ({
  analysesService: {},
}));

const renderDialog = (lockKind: boolean) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NewAnalysisDialog
        open
        onOpenChange={vi.fn()}
        scope={{ teamId: 't1' }}
        documents={[]}
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
});
