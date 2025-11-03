'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { PUBLIC_ROUTES, AUTH_ROUTES } from '@/constants/routes';
import { AppSidebar } from '@/components/dashboard/sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { DashboardHeader } from '@/components/dashboard/header';
import { cn } from '@/utils/common';

function titleFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return 'Home';
  const first = parts[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const noChrome = React.useMemo(() => {
    // Exact-match check; extend as needed for wildcard routes
    return PUBLIC_ROUTES.includes(pathname) || AUTH_ROUTES.includes(pathname);
  }, [pathname]);

  if (noChrome) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <AppSidebar className="relative" />
      <div className="flex flex-1 flex-col">
        {!pathname.includes('/chat') && (
          <DashboardHeader heading={titleFromPath(pathname)} />
        )}
        <div
          className={cn(
            'flex flex-col gap-4 p-4 pt-0 h-[calc(100vh-3.5rem)] overflow-auto',
            pathname.includes('/chat') && 'h-[calc(100vh)]'
          )}
        >
          {' '}
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
}
