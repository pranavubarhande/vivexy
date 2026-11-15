'use client';

import { useEffect } from 'react';
import { Building2, User } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vivexy/ui/select';
import { useTeams } from '@vivexy/core/hooks/useTeams';
import { useActiveTeam, useChatTeam } from '@vivexy/core/hooks/useActiveTeam';

const PERSONAL_VALUE = 'personal';

export const TeamSwitcher = ({ enabled }: { enabled: boolean }) => {
  const { data: teams } = useTeams(enabled);
  const { activeTeamId, setActiveTeamId } = useActiveTeam();
  const chatTeamId = useChatTeam();
  const inChat = chatTeamId !== undefined;

  const activeTeamIsValid =
    !activeTeamId || !!teams?.some((team) => team.id === activeTeamId);

  useEffect(() => {
    if (teams && !activeTeamIsValid) setActiveTeamId(null);
  }, [teams, activeTeamIsValid, setActiveTeamId]);

  if (!teams?.length) return null;

  const selected = inChat ? chatTeamId : activeTeamId;

  return (
    <div className="group-data-[collapsible=icon]:hidden">
      <p className="mb-1 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
        {inChat ? 'This chat is billed to' : 'Usage billed to'}
      </p>
      <Select
        disabled={inChat}
        value={
          selected && (inChat || activeTeamIsValid) ? selected : PERSONAL_VALUE
        }
        onValueChange={(value) =>
          setActiveTeamId(value === PERSONAL_VALUE ? null : value)
        }
      >
        <SelectTrigger
          className="h-9 w-full bg-background/60"
          title={
            inChat
              ? 'A chat stays with the team it was started in. Start a new chat to bill another team.'
              : undefined
          }
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PERSONAL_VALUE}>
            <span className="flex items-center gap-2">
              <User className="size-3.5" />
              Personal
            </span>
          </SelectItem>
          {teams.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              <span className="flex items-center gap-2">
                <Building2 className="size-3.5" />
                {team.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
