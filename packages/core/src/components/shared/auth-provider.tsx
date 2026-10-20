'use client';

import React, { createContext, useContext, useState } from 'react';
import {
  useCurrentUser,
  useLogin,
  useRegister,
  useLogout,
} from '../../hooks/useAuth';
import {
  AuthUser,
  LoginCredentials,
  RegisterCredentials,
} from '../../types/user';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  token: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [token, setToken] = useState<string | null>(() => {
    // Initialize token state directly from localStorage to avoid synchronous setState in useEffect
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token');
    }
    return null;
  });

  const { data: user, isLoading, error } = useCurrentUser();
  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const logoutMutation = useLogout();

  // Update token when user logs in
  React.useEffect(() => {
    if (loginMutation.data?.token) {
      localStorage.setItem('token', loginMutation.data.token);
      setToken(loginMutation.data.token);
    }
  }, [loginMutation.data]);

  // Update token when user registers
  React.useEffect(() => {
    if (registerMutation.data?.token) {
      localStorage.setItem('token', registerMutation.data.token);
      setToken(registerMutation.data.token);
    }
  }, [registerMutation.data]);

  const login = async (credentials: LoginCredentials) => {
    await loginMutation.mutateAsync(credentials);
  };

  const register = async (credentials: RegisterCredentials) => {
    await registerMutation.mutateAsync(credentials);
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const value: AuthContextType = {
    user: user || null,
    isLoading:
      isLoading || loginMutation.isPending || registerMutation.isPending,
    isAuthenticated: !!user && !error,
    login,
    register,
    logout,
    token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Custom hook that safely handles SSR and hydration
export function useAuthSafe() {
  try {
    return useAuth();
  } catch {
    return {
      user: null,
      isLoading: false,
      isAuthenticated: false,
      login: async () => {},
      register: async () => {},
      logout: async () => {},
      token: null,
    };
  }
}
