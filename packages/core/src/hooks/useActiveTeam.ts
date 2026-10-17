import { useSyncExternalStore } from 'react';
import {
  getActiveTeamId,
  setActiveTeamId,
  subscribeToActiveTeam,
} from '../lib/active-team';

export const useActiveTeam = () => {
  const activeTeamId = useSyncExternalStore(
    subscribeToActiveTeam,
    getActiveTeamId,
    () => null
  );
  return { activeTeamId, setActiveTeamId };
};
