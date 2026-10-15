const ACTIVE_TEAM_KEY = 'activeTeamId';
const ACTIVE_TEAM_EVENT = 'vivexy:active-team-changed';

export const getActiveTeamId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ACTIVE_TEAM_KEY);
  } catch {
    return null;
  }
};

export const setActiveTeamId = (teamId: string | null) => {
  try {
    if (teamId) localStorage.setItem(ACTIVE_TEAM_KEY, teamId);
    else localStorage.removeItem(ACTIVE_TEAM_KEY);
  } catch {
    // Storage can be unavailable (private mode); the selection just won't persist.
  }
  window.dispatchEvent(new Event(ACTIVE_TEAM_EVENT));
};

export const subscribeToActiveTeam = (onChange: () => void) => {
  window.addEventListener(ACTIVE_TEAM_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(ACTIVE_TEAM_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
};
