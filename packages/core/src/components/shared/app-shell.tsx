'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { PUBLIC_ROUTES, AUTH_ROUTES } from '@vivexy/core/constants/routes';
import { AppSidebar } from '@vivexy/core/dashboard/sidebar';
import { SidebarProvider, useSidebar } from '@vivexy/ui/sidebar';
import { DashboardHeader } from '@vivexy/core/dashboard/header';
import { WorkspaceProvider } from '@vivexy/core/desktop/workspace-provider';
import { VerifyEmailBanner } from './verify-email-banner';
import { cn } from '@vivexy/ui/utils';
import { PanelLeft } from 'lucide-react';

function titleFromPath(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return 'Home';
  const first = parts[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Floating sidebar trigger shown only on mobile when sidebar is closed */
export function MobileSidebarTrigger() {
  const { isMobile, openMobile, toggleSidebar } = useSidebar();
  if (!isMobile || openMobile) return null;

  return (
    <button
      onClick={toggleSidebar}
      className="p-2 rounded-xl bg-background/90 backdrop-blur-sm text-foreground hover:bg-muted transition-all active:scale-95 md:hidden"
      aria-label="Open sidebar"
    >
      <PanelLeft size={18} />
    </button>
  );
}

export function AppShell({
  children,
  appName,
}: {
  children: React.ReactNode;
  appName?: string;
}) {
  const pathname = usePathname();

  const normalizedPath = pathname.replace(/\/$/, '') || '/';
  const noChrome = React.useMemo(
    () =>
      PUBLIC_ROUTES.includes(normalizedPath) ||
      AUTH_ROUTES.includes(normalizedPath),
    [normalizedPath]
  );

  if (noChrome) return <>{children}</>;

  const isChatPage = pathname.includes('/chat');

  return (
    <WorkspaceProvider>
      <SidebarProvider>
        <AppSidebar appName={appName} className="relative" />
        <div className="flex flex-1 flex-col min-w-0">
          <VerifyEmailBanner />
          {!isChatPage && (
            <DashboardHeader heading={titleFromPath(pathname)}>
              <MobileSidebarTrigger />
            </DashboardHeader>
          )}
          <div
            className={cn(
              'flex flex-col gap-4 p-4 pt-0 h-[calc(100vh-3.5rem)] overflow-auto',
              isChatPage && 'h-[calc(100vh)] p-0'
            )}
          >
            {children}
          </div>
        </div>
      </SidebarProvider>
    </WorkspaceProvider>
  );
}
