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
import { useActiveTeam } from '@vivexy/core/hooks/useActiveTeam';

const PERSONAL_VALUE = 'personal';

export const TeamSwitcher = ({ enabled }: { enabled: boolean }) => {
  const { data: teams } = useTeams(enabled);
  const { activeTeamId, setActiveTeamId } = useActiveTeam();

  const activeTeamIsValid =
    !activeTeamId || !!teams?.some((team) => team.id === activeTeamId);

  useEffect(() => {
    if (teams && !activeTeamIsValid) setActiveTeamId(null);
  }, [teams, activeTeamIsValid, setActiveTeamId]);

  if (!teams?.length) return null;

  return (
    <div className="group-data-[collapsible=icon]:hidden">
      <p className="mb-1 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
        Usage billed to
      </p>
      <Select
        value={
          activeTeamIsValid && activeTeamId ? activeTeamId : PERSONAL_VALUE
        }
        onValueChange={(value) =>
          setActiveTeamId(value === PERSONAL_VALUE ? null : value)
        }
      >
        <SelectTrigger className="h-9 w-full bg-background/60">
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
