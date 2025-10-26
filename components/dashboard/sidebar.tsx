'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES } from '@/constants/routes';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Settings as SettingsIcon,
  Briefcase,
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
      label: 'Jobs',
      href: ROUTES.jobs,
      icon: Briefcase,
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
  ];

  const iconFor = (href: string) => {
    const item = mainItems.find((item) => item.href === href);
    return item ? <item.icon size={16} /> : <LayoutDashboard size={16} />;
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
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
      <SidebarFooter className="absolute bottom-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <NavUser />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname === ROUTES.settings}>
              <Link href={ROUTES.settings} className="flex items-center gap-2">
                <SettingsIcon size={16} />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
