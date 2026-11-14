import { useSyncExternalStore } from 'react';
import {
  getActiveTeamId,
  getChatTeamId,
  setActiveTeamId,
  subscribeToActiveTeam,
  subscribeToChatTeam,
} from '../lib/active-team';

export const useActiveTeam = () => {
  const activeTeamId = useSyncExternalStore(
    subscribeToActiveTeam,
    getActiveTeamId,
    () => null
  );
  return { activeTeamId, setActiveTeamId };
};

/** The open chat's team (null for personal), or undefined outside a chat. */
export const useChatTeam = () =>
  useSyncExternalStore(subscribeToChatTeam, getChatTeamId, () => undefined);
