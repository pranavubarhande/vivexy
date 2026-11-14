import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { promptsService } from '../services/prompts.service';

export const promptKeys = {
  all: ['prompts'] as const,
  list: (teamId?: string | null) =>
    [...promptKeys.all, 'list', teamId ?? null] as const,
};

export const usePrompts = (teamId?: string | null) =>
  useQuery({
    queryKey: promptKeys.list(teamId),
    queryFn: () => promptsService.list(teamId),
  });

const usePromptMutation = <TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: promptKeys.all }),
  });
};

export const useCreatePrompt = () => usePromptMutation(promptsService.create);
export const useUpdatePrompt = () => usePromptMutation(promptsService.update);
export const useDeletePrompt = () => usePromptMutation(promptsService.remove);
export const useDuplicatePrompt = () =>
  usePromptMutation(promptsService.duplicate);
export const useRenderPrompt = () => usePromptMutation(promptsService.render);
