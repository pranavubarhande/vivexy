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
  useSidebar,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Settings as SettingsIcon,
  Briefcase,
  MessageSquare,
  Plus,
  Trash2,
} from 'lucide-react';
import { NavUser } from './nav-user';
import { useChats, useCreateChat, useDeleteChat } from '@/hooks/useChat';
import { Button } from '@/components/ui/button';
// import { ScrollArea } from '@/components/ui/scroll-area';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { state } = useSidebar();
  const { chats, isLoading: chatsLoading } = useChats();
  const createChat = useCreateChat();
  const deleteChat = useDeleteChat();

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

  const handleCreateChat = async () => {
    try {
      await createChat.mutateAsync({});
      // Navigation happens in the hook's onSuccess callback
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
  };

  return (
    <Sidebar collapsible="icon" {...props}>
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

        {/* Chat Section - Only show when sidebar is not collapsed */}
        {state !== 'collapsed' && (
          <SidebarGroup>
            <div className="flex items-center justify-between pl-2 py-1">
              <span className="text-sm font-medium">Chats</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCreateChat}
                disabled={createChat.isPending}
                className="h-6 w-6 p-0"
              >
                <Plus size={12} />
              </Button>
            </div>
            <SidebarGroupContent>
              <div className="max-h-60 overflow-y-auto">
                {chatsLoading ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    Loading chats...
                  </div>
                ) : chats.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    No chats yet
                  </div>
                ) : (
                  <SidebarMenu>
                    {chats
                      .filter((chat) => {
                        // Don't show chats with no messages
                        return chat.messages && chat.messages.length > 0;
                      })
                      .map((chat) => {
                        const chatHref = ROUTES.chat(chat.id);
                        const active = pathname === chatHref;
                        return (
                          <SidebarMenuItem key={chat.id}>
                            <div className="flex items-center justify-between w-full">
                              <SidebarMenuButton
                                asChild
                                isActive={active}
                                className="flex-1"
                              >
                                <Link
                                  href={chatHref}
                                  className="flex items-center gap-2"
                                >
                                  <MessageSquare size={14} />
                                  <span className="truncate text-xs">
                                    {chat.title || 'New Chat'}
                                  </span>
                                </Link>
                              </SidebarMenuButton>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (
                                    confirm(
                                      'Are you sure you want to delete this chat?'
                                    )
                                  ) {
                                    deleteChat.mutate(chat.id, {
                                      onSuccess: () => {
                                        // If this was the currently selected chat, navigate to dashboard
                                        if (pathname === ROUTES.chat(chat.id)) {
                                          window.location.href =
                                            ROUTES.dashboard;
                                        }
                                      },
                                    });
                                  }
                                }}
                                disabled={deleteChat.isPending}
                                className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
                              >
                                <Trash2 size={10} />
                              </Button>
                            </div>
                          </SidebarMenuItem>
                        );
                      })}
                  </SidebarMenu>
                )}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
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
