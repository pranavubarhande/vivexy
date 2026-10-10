export interface User {
  id: string;
  email: string;
  name: string | null;
  password: string; // Only used internally, not exposed in API responses
  role: Role;
  avatar: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type Role = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

// Auth Types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  avatar: string | null;
  emailVerified: boolean;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}
