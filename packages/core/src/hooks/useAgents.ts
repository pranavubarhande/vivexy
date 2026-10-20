import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentsService } from '../services/agents.service';
import { useAppConfig } from '@vivexy/core/shared/app-config-provider';
import type { AgentSummary, DeployedAgent } from '../types/agent';

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

/** Merges the product's base agents with any catalogue agents the user has deployed. */
export const useDeployedAgentSummaries = (): AgentSummary[] => {
  const { data: deployed = [] } = useDeployedAgents();
  const { agents } = useAppConfig();

  const deployedIds = new Set(deployed.map((d: DeployedAgent) => d.agentId));

  const catalogueSummaries: AgentSummary[] = agents.catalogue
    .filter((a) => deployedIds.has(a.id))
    .map(({ id, name, description, icon, color }) => ({
      id,
      name,
      description,
      icon,
      color,
    }));

  return [...agents.base, ...catalogueSummaries];
};
