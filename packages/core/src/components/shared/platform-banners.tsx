'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, Info, TriangleAlert, X } from 'lucide-react';
import { Button } from '@vivexy/ui/button';
import { cn } from '@vivexy/ui/utils';
import { useAuthSafe } from './auth-provider';
import { announcementsService } from '../../services/announcements.service';
import { stopImpersonation } from '../../lib/impersonation';
import { AnnouncementLevel } from '../../types/admin';

const DISMISSED_KEY = 'dismissedAnnouncements';

const readDismissed = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
  } catch {
    return [];
  }
};

const LEVEL_STYLES: Record<AnnouncementLevel, string> = {
  info: 'border-sky-500/20 bg-sky-500/10 text-sky-900 dark:text-sky-200',
  warning:
    'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  critical:
    'border-destructive/30 bg-destructive/10 text-destructive dark:text-red-300',
};

export const ImpersonationBanner = () => {
  const { user } = useAuthSafe();
  if (!user?.impersonatedBy) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-400 px-4 py-2 text-sm text-amber-950">
      <span className="flex items-center gap-2">
        <Eye className="size-4" />
        Viewing as <strong>{user.email}</strong> · read-only session started by{' '}
        {user.impersonatedBy}
      </span>
      <Button
        size="sm"
        variant="dark"
        className="h-7"
        onClick={stopImpersonation}
      >
        Exit
      </Button>
    </div>
  );
};

export const AnnouncementBanners = () => {
  const { isAuthenticated } = useAuthSafe();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements'],
    queryFn: announcementsService.getActive,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });

  const visible = announcements.filter(
    (announcement) => !dismissed.includes(announcement.id)
  );
  if (!visible.length) return null;

  const dismiss = (announcementId: string) => {
    const nextDismissed = [...dismissed, announcementId];
    setDismissed(nextDismissed);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(nextDismissed));
    } catch {
      // Dismissal just won't persist across reloads.
    }
  };

  return (
    <>
      {visible.map((announcement) => (
        <div
          key={announcement.id}
          className={cn(
            'flex items-start justify-between gap-3 border-b px-4 py-2 text-sm',
            LEVEL_STYLES[announcement.level]
          )}
        >
          <span className="flex items-start gap-2">
            {announcement.level === 'info' ? (
              <Info className="mt-0.5 size-4 shrink-0" />
            ) : (
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            )}
            <span>
              <strong>{announcement.title}</strong>
              {announcement.body && <span> — {announcement.body}</span>}
            </span>
          </span>
          {announcement.level !== 'critical' && (
            <button
              type="button"
              onClick={() => dismiss(announcement.id)}
              aria-label="Dismiss announcement"
              className="opacity-70 hover:opacity-100"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      ))}
    </>
  );
};
