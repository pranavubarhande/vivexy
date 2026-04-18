import { useQuery } from '@tanstack/react-query';
import { skillsService } from '@/services/skills.service';

export const useOfficialSkills = () =>
  useQuery({
    queryKey: ['skills', 'official'],
    queryFn: skillsService.getOfficialSkills,
    staleTime: 10 * 60 * 1000, // catalog rarely changes — cache for 10 min
  });
