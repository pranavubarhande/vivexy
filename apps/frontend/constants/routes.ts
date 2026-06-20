export const ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',
  dashboard: '/dashboard',
  settings: '/settings',
  teams: '/teams',
  billing: '/billing',
  connectors: '/connectors',
  workflows: '/workflows',
  template: '/template',
  integrations: '/integrations',
  insights: '/insights',
  chat: (chatId?: string) => (chatId ? `/chat/${chatId}` : '/chat'),
  scheduledTasks: '/scheduled-tasks',
  costManager: '/cost-manager',
} as const;

// Publicly accessible informational pages (no auth required, even if logged in)
export const PUBLIC_ROUTES: string[] = [
  '/',
  '/contact',
  '/pricing',
  '/privacy',
  '/terms',
  '/security',
  '/support',
  '/workflows',
  '/template',
  '/integrations',
  '/insights',
];

// Auth-only entry pages. If the user is already logged in, redirect away from these.
export const AUTH_ROUTES: string[] = ['/login', '/register'];
