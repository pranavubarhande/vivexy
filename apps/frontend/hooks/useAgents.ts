import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsService } from '@/services/agents.service';
import { CATALOGUE_AGENTS } from '@/agents/catalogue';
import { AGENT_SUMMARIES } from '@/agents/client-config';
import type { AgentSummary, DeployedAgent } from '@/types/agent';

const QUERY_KEY = ['agents', 'deployed'] as const;

export const useDeployedAgents = () =>
  useQuery({
    queryKey: QUERY_KEY,
    queryFn: agentsService.getDeployedAgents,
    staleTime: 5 * 60 * 1000,
  });

export const useDeployAgent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: agentsService.deployAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
};

export const useUndeployAgent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: agentsService.undeployAgent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
};

/** Merges the base assistant with any catalogue agents the user has deployed. */
export const useDeployedAgentSummaries = (): AgentSummary[] => {
  const { data: deployed = [] } = useDeployedAgents();

  const deployedIds = new Set(deployed.map((d: DeployedAgent) => d.agentId));

  const catalogueSummaries: AgentSummary[] = CATALOGUE_AGENTS.filter((a) =>
    deployedIds.has(a.id)
  ).map(({ id, name, description, icon, color }) => ({
    id,
    name,
    description,
    icon,
    color,
  }));

  return [...AGENT_SUMMARIES, ...catalogueSummaries];
};
