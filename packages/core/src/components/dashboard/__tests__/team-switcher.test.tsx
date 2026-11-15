import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamSwitcher } from '../team-switcher';
import { setActiveTeamId, setChatTeamId } from '../../../lib/active-team';

vi.mock('@vivexy/core/hooks/useTeams', () => ({
  useTeams: () => ({
    data: [
      { id: 'firm-1', name: 'Harlow & Pierce' },
      { id: 'team-2', name: 'Side project' },
    ],
  }),
}));

afterEach(() => {
  act(() => {
    setChatTeamId(undefined);
    setActiveTeamId(null);
  });
});

describe('TeamSwitcher', () => {
  it('shows the default team for new chats outside a chat', () => {
    act(() => setActiveTeamId('team-2'));
    render(<TeamSwitcher enabled />);
    expect(screen.getByText('Usage billed to')).toBeTruthy();
    expect(screen.getByRole('combobox').textContent).toContain('Side project');
    expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(false);
  });

  it("shows and locks the open chat's own team", () => {
    act(() => setActiveTeamId(null));
    render(<TeamSwitcher enabled />);
    act(() => setChatTeamId('firm-1'));

    expect(screen.getByText('This chat is billed to')).toBeTruthy();
    const trigger = screen.getByRole('combobox');
    expect(trigger.textContent).toContain('Harlow & Pierce');
    expect(trigger.hasAttribute('disabled')).toBe(true);

    act(() => setChatTeamId(null));
    expect(screen.getByRole('combobox').textContent).toContain('Personal');

    act(() => setChatTeamId(undefined));
    expect(screen.getByText('Usage billed to')).toBeTruthy();
  });
});
