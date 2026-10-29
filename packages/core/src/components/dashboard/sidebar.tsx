'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES } from '@vivexy/core/constants/routes';
import Image from 'next/image';
import { useWorkspace } from '@vivexy/core/desktop/workspace-provider';
import { useAuth } from '@vivexy/core/shared/auth-provider';
import { useAdministeredTeams } from '@vivexy/core/hooks/useAdmin';
import { useFeatures } from '@vivexy/core/hooks/useFeatures';
import { useAppConfig } from '@vivexy/core/shared/app-config-provider';
import type { NavItem } from '@vivexy/core/configs/app-config';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from '@vivexy/ui/sidebar';
import {
  FolderOpen,
  ChevronRight,
  Plus,
  ShieldCheck,
  Crown,
  CreditCard,
} from 'lucide-react';
import { NavUser } from './nav-user';
import { TeamSwitcher } from './team-switcher';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@vivexy/ui/tooltip';

export function AppSidebar({
  appName: appNameProp,
  ...props
}: React.ComponentProps<typeof Sidebar> & { appName?: string }) {
  const pathname = usePathname();
  const appConfig = useAppConfig();
  const appName = appNameProp ?? appConfig.appName;
  const { workspacePath, workspaceInfo, isDesktop, changeWorkspace } =
    useWorkspace();
  const { user, isAuthenticated } = useAuth();
  const { data: administeredTeams } = useAdministeredTeams(isAuthenticated);
  const { isEnabled } = useFeatures(isAuthenticated);

  const adminItems: NavItem[] = [
    ...(administeredTeams?.length
      ? [
          { label: 'Admin', href: ROUTES.admin, icon: ShieldCheck },
          { label: 'Billing', href: ROUTES.billing, icon: CreditCard },
        ]
      : []),
    ...(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
      ? [{ label: 'Superadmin', href: ROUTES.superadmin, icon: Crown }]
      : []),
  ];
  const navGroups = (
    adminItems.length
      ? [...appConfig.navGroups, { label: 'Administration', items: adminItems }]
      : appConfig.navGroups
  ).map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.features || item.features.some(isEnabled)
    ),
  }));

  const isActive = (href: string) =>
    pathname === href || !!pathname?.startsWith(href + '/');

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="gap-3 px-3 pt-4">
        <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
          <Link
            href={appConfig.homePath}
            className="flex items-center gap-2.5 px-1 group-data-[collapsible=icon]:hidden"
          >
            <span className="flex size-8 items-center justify-center rounded-xl bg-night shadow-sm ring-1 ring-black/5">
              <Image
                src={appConfig.logoSrc}
                alt={appName}
                width={18}
                height={18}
                className="object-contain invert"
              />
            </span>
            <span className="text-[17px] font-semibold tracking-tight truncate">
              {appName}
            </span>
          </Link>
          <SidebarTrigger className="text-muted-foreground" />
        </div>

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="New chat"
              className="h-10 justify-center rounded-full bg-foreground font-medium text-background shadow-sm hover:bg-foreground/85 hover:text-background active:bg-foreground active:text-background group-data-[collapsible=icon]:rounded-lg"
            >
              <Link href={ROUTES.chat()}>
                <Plus />
                <span>New chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <TeamSwitcher enabled={isAuthenticated} />
      </SidebarHeader>

      <SidebarContent className="px-1">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-3 pb-3">
        <SidebarMenu>
          {/* Workspace indicator — Electron only */}
          {isDesktop && workspacePath && (
            <SidebarMenuItem>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      onClick={changeWorkspace}
                      className="group-data-[collapsible=icon]:justify-center h-auto py-2"
                    >
                      <div className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FolderOpen size={14} className="text-ink" />
                      </div>
                      <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                        <div className="text-xs font-medium truncate">
                          {workspaceInfo?.name || 'Project'}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {workspaceInfo
                            ? `${workspaceInfo.fileCount} files, ${workspaceInfo.folderCount} folders`
                            : 'Change folder'}
                        </div>
                      </div>
                      <ChevronRight
                        size={12}
                        className="shrink-0 text-muted-foreground/40 group-data-[collapsible=icon]:hidden"
                      />
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p className="text-xs">{workspacePath}</p>
                    <p className="text-xs text-muted-foreground">
                      Click to change
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem className="rounded-xl border border-sidebar-border bg-background/60 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent">
            <NavUser />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
