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

const CHAT_TEAM_EVENT = 'vivexy:chat-team-changed';
let chatTeamId: string | null | undefined;

/** The team the open chat bills to: a team id, null for a personal chat,
 * undefined when no saved chat is open. The chat screen sets it so the team
 * switcher can show the chat's team instead of the default for new chats. */
export const getChatTeamId = (): string | null | undefined => chatTeamId;

export const setChatTeamId = (teamId: string | null | undefined) => {
  if (teamId === chatTeamId) return;
  chatTeamId = teamId;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHAT_TEAM_EVENT));
  }
};

export const subscribeToChatTeam = (onChange: () => void) => {
  window.addEventListener(CHAT_TEAM_EVENT, onChange);
  return () => window.removeEventListener(CHAT_TEAM_EVENT, onChange);
};
