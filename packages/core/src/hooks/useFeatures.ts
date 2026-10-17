import { useQuery } from '@tanstack/react-query';
import { userService } from '../services/user.service';
import { FeatureName } from '../constants/features';

export const useFeatures = (enabled = true) => {
  const query = useQuery({
    queryKey: ['me', 'features'],
    queryFn: userService.getFeatures,
    staleTime: 5 * 60 * 1000,
    enabled,
  });
  // Optimistically on until loaded; the backend enforces either way.
  const isEnabled = (feature: FeatureName) => query.data?.[feature] !== false;
  return { ...query, isEnabled };
};
