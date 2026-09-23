import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, UserStatus } from '@deliveryos/shared';
import { api } from '../api/client';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  organizationId?: string | null;
  organization?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  profile?: {
    firstName: string;
    lastName: string;
    displayName?: string | null;
    avatarUrl?: string | null;
    jobTitle?: string | null;
  } | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, passwordPlain: string) => Promise<AuthUser>;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('deliveryos_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchMe = async () => {
    try {
      if (!localStorage.getItem('deliveryos_token')) {
        setUser(null);
        return;
      }
      const userData = await api.get<AuthUser>('/auth/me');
      setUser(userData);
    } catch {
      localStorage.removeItem('deliveryos_token');
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMe();

    // Centralized 401/403 handling in the API client dispatches this event so
    // the auth context can reset its in-memory state (the router then redirects
    // the user back to /login).
    const onSessionExpired = () => logout();
    window.addEventListener('deliveryos:session-expired', onSessionExpired);
    return () => window.removeEventListener('deliveryos:session-expired', onSessionExpired);
  }, []);

  const login = async (email: string, passwordPlain: string) => {
    setIsLoading(true);
    try {
      const res = await api.post<{ token: string; user: AuthUser }>('/auth/login', {
        email,
        password: passwordPlain,
      });
      localStorage.setItem('deliveryos_token', res.token);
      setToken(res.token);
      setUser(res.user);
      return res.user;
    } finally {
      setIsLoading(false);
    }
  };

  const setSession = (token: string, user: AuthUser) => {
    localStorage.setItem('deliveryos_token', token);
    setToken(token);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('deliveryos_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, setSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
