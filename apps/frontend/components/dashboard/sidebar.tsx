'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES } from '@/constants/routes';
import { APP_NAME } from '@/constants/project';
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
} from 'lucide-react';
import { NavUser } from './nav-user';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();

  const mainItems = [
    {
      label: 'Dashboard',
      href: ROUTES.dashboard,
      icon: LayoutDashboard,
    },
    {
      label: 'Teams',
      href: ROUTES.teams,
      icon: Users,
    },
    {
      label: 'Billing',
      href: ROUTES.billing,
      icon: CreditCard,
    },
    {
      label: 'Chat',
      href: ROUTES.chat(),
      icon: MessageSquare,
    },
    {
      label: 'Integrations',
      href: ROUTES.connectors,
      icon: Blocks,
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
          <span className="px-2 font-semibold text-lg truncate group-data-[collapsible=icon]:hidden">
            {APP_NAME}
          </span>
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
          <SidebarMenuItem>
            <NavUser />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
