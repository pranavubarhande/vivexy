'use client';

import { useQuery } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { cn } from '@vivexy/ui/utils';
import { superadminService } from '@vivexy/core/services/superadmin.service';
import { superadminKeys } from '@vivexy/core/hooks/useSuperadmin';

const SEVERITY_STYLES = {
  info: 'border-sky-500/20 bg-sky-500/5',
  warning: 'border-amber-500/30 bg-amber-500/10',
  critical: 'border-destructive/30 bg-destructive/10',
} as const;

export const PlatformAlerts = () => {
  const { data: alerts = [] } = useQuery({
    queryKey: superadminKeys.alerts(),
    queryFn: superadminService.getAlerts,
    refetchInterval: 60_000,
  });

  if (!alerts.length) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.key}
          className={cn(
            'flex items-start gap-3 rounded-2xl border p-3 text-sm',
            SEVERITY_STYLES[alert.severity]
          )}
        >
          <BellRing className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{alert.title}</p>
            <p className="text-muted-foreground">{alert.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
