import { Role } from './user';
import { TeamRole } from './team';

export type BudgetEnforcement = 'warn' | 'block';

export interface TeamSettingsData {
  monthlyBudgetUsd?: number | null;
  budgetEnforcement?: BudgetEnforcement;
  allowedModelIds?: string[] | null;
}

export interface UsageTotals {
  totalTokens: number;
  totalCostUsd: number;
  messageCount: number;
}

export interface DailyUsagePoint extends UsageTotals {
  date: string;
}

export interface ModelUsagePoint extends UsageTotals {
  modelName: string;
  provider: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  teamId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Client admin (team OWNER / ADMIN)
// ---------------------------------------------------------------------------

export interface AdministeredTeam {
  id: string;
  name: string;
  slug: string;
  role: TeamRole;
  isSuspended: boolean;
  memberCount: number;
}

export interface TeamAdminOverview {
  team: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isSuspended: boolean;
    seatLimit: number | null;
    monthlyBudgetUsd: number | null;
    budgetEnforcement: BudgetEnforcement;
    allowedModelIds: string[] | null;
    featureFlags: Record<string, boolean>;
    createdAt: string | null;
  };
  viewerRole: TeamRole;
  memberCount: number;
  activeMemberCount: number;
  pendingInviteCount: number;
  usage: UsageTotals;
  monthToDateCostUsd: number;
  daily: DailyUsagePoint[];
  byModel: ModelUsagePoint[];
  periodDays: number;
}

export interface TeamMemberWithUsage {
  id: string;
  role: TeamRole;
  joinedAt: string | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    avatar: string | null;
    isSuspended: boolean;
    lastLoginAt: string | null;
  };
  usage: UsageTotals & { lastActiveAt: string | null };
}

export interface TeamInviteSummary {
  id: string;
  email: string;
  role: TeamRole;
  invitedBy: string;
  expiresAt: string;
  isExpired: boolean;
  createdAt: string | null;
}

// ---------------------------------------------------------------------------
// Superadmin (platform operator)
// ---------------------------------------------------------------------------

export interface PlatformOverview {
  users: {
    total: number;
    new7d: number;
    new30d: number;
    active30d: number;
    suspended: number;
  };
  clients: { total: number; new30d: number; suspended: number };
  activity: { chats: number; messages: number };
  usage: {
    allTime: UsageTotals;
    last30d: UsageTotals;
    monthToDate: UsageTotals;
  };
  subscriptions: {
    paidByPlan: Record<string, number>;
    activeTotal: number;
  };
}

export interface PlatformUsage {
  daily: DailyUsagePoint[];
  byModel: ModelUsagePoint[];
  periodDays: number;
}

export interface ClientSummary {
  id: string;
  name: string;
  slug: string;
  owner: { id: string; name: string | null; email: string };
  memberCount: number;
  seatLimit: number | null;
  isSuspended: boolean;
  plan: string;
  usage: {
    totalCostUsd: number;
    totalTokens: number;
    lastActiveAt: string | null;
  };
  createdAt: string | null;
}

export interface ClientDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  owner: { id: string; name: string | null; email: string };
  isSuspended: boolean;
  seatLimit: number | null;
  monthlyBudgetUsd: number | null;
  notes: string | null;
  plan: string;
  createdAt: string | null;
  members: TeamMemberWithUsage[];
  invites: TeamInviteSummary[];
  usage: {
    period: UsageTotals;
    allTime: UsageTotals;
    monthToDate: UsageTotals;
    daily: DailyUsagePoint[];
  };
  recentAuditLogs: AuditLogEntry[];
  periodDays: number;
}

export interface ClientUpdateData {
  isSuspended?: boolean;
  seatLimit?: number | null;
  notes?: string | null;
}

export interface PlatformUser {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: Role;
  emailVerified: boolean;
  isSuspended: boolean;
  oauthProvider: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  teamCount: number;
  usage: UsageTotals;
}

export interface PlatformUserDetail extends PlatformUser {
  teams: {
    id: string;
    name: string;
    role: TeamRole;
    isSuspended: boolean;
    joinedAt: string | null;
  }[];
  chatCount: number;
  allTimeUsage: UsageTotals;
  daily: DailyUsagePoint[];
  byModel: ModelUsagePoint[];
  periodDays: number;
}

export interface PlatformUserUpdateData {
  isSuspended?: boolean;
  role?: Role;
}

export interface ListQuery {
  search?: string;
  page?: number;
  pageSize?: number;
  suspended?: boolean;
  days?: number;
}

export interface UserListQuery extends ListQuery {
  role?: Role;
}
