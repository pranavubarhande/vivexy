'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES } from '@/constants/routes';
import { APP_NAME } from '@/constants/project';
import Image from 'next/image';
import { useWorkspace } from '@/components/desktop/workspace-provider';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  MessageSquare,
  Blocks,
  FolderOpen,
  ChevronRight,
  CalendarClock,
} from 'lucide-react';
import { NavUser } from './nav-user';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { workspacePath, workspaceInfo, isDesktop, changeWorkspace } =
    useWorkspace();

  const mainItems = [
    {
      label: 'Chat',
      href: ROUTES.chat(),
      icon: MessageSquare,
    },
    {
      label: 'Teams',
      href: ROUTES.teams,
      icon: Users,
    },
    // Note: Add this when we want to add billing
    // {
    //   label: 'Billing',
    //   href: ROUTES.billing,
    //   icon: CreditCard,
    // },
    {
      label: 'Integrations',
      href: ROUTES.connectors,
      icon: Blocks,
    },
    {
      label: 'Scheduled Tasks',
      href: ROUTES.scheduledTasks,
      icon: CalendarClock,
    },
  ];

  const iconFor = (href: string) => {
    const item = mainItems.find((item) => item.href === href);
    return item ? <item.icon size={16} /> : <LayoutDashboard size={16} />;
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center p-1">
          <div className="flex items-center gap-2 px-2 group-data-[collapsible=icon]:hidden">
            <Image
              src="/logo.png"
              alt={APP_NAME}
              width={24}
              height={24}
              className="rounded-sm object-contain shrink-0"
            />
            <span className="font-semibold text-lg truncate">{APP_NAME}</span>
          </div>
          <SidebarTrigger />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname?.startsWith(item.href + '/');
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={!!active}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-2"
                      >
                        {iconFor(item.href)}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="absolute bottom-0 w-full">
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
                        <FolderOpen size={14} className="text-primary" />
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
          <SidebarMenuItem>
            <NavUser />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
