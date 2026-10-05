import { Team } from './team';
import { Chat } from './chat';

export type ProjectRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    chats: number;
    members: number;
    teams: number;
  };
}

export interface ProjectWithChats extends Project {
  chats: Chat[];
}

export interface ProjectMember {
  id: string;
  userId: string;
  projectId: string;
  role: ProjectRole;
  joinedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    avatar: string | null;
  };
}

export interface ProjectTeam {
  id: string;
  projectId: string;
  teamId: string;
  addedAt: string;
  team: Team;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  color?: string;
}
