import { User } from './user';

export interface Team {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  owner: User;
  members: TeamMember[];
  _count?: {
    members: number;
  };
}

export interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: TeamRole;
  joinedAt: Date;
  user: User;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: TeamRole;
  token: string;
  teamId: string;
  invitedBy: string;
  expiresAt: Date;
  createdAt: Date;
  team: Team;
}

export interface CreateTeamData {
  name: string;
  description?: string;
}

export interface UpdateTeamData {
  name?: string;
  description?: string;
}

export interface InviteMemberData {
  email: string;
  role: TeamRole;
}

export type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';
