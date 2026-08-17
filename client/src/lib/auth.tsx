'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import api from './api';
import { clearAllCachedPageData, REPORT_CACHE_STORAGE_KEY } from './page-cache';
import {
  AUTH_STATE_CLEARED_EVENT,
  clearAuthSession,
  isJwtExpired,
  loadStoredAuthToken,
  saveAuthSession,
  type StoredAuthUser,
} from './auth-session';

interface AuthContextType {
  user: StoredAuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<StoredAuthUser>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<StoredAuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const syncSession = async () => {
      const storedToken = loadStoredAuthToken();
      if (!storedToken) {
        clearAuthSession();
        if (!cancelled) setLoading(false);
        return;
      }

      if (isJwtExpired(storedToken)) {
        clearAuthSession();
        if (!cancelled) {
          setToken(null);
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await api.get<StoredAuthUser>('/auth/me');
        if (cancelled) return;

        const freshUser = res.data;
        saveAuthSession(storedToken, freshUser);
        setToken(storedToken);
        setUser(freshUser);
      } catch {
        clearAuthSession();
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const handleAuthCleared = () => {
      setToken(null);
      setUser(null);
    };

    window.addEventListener(AUTH_STATE_CLEARED_EVENT, handleAuthCleared);
    void syncSession();

    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_STATE_CLEARED_EVENT, handleAuthCleared);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    const { accessToken, user: userData } = res.data as { accessToken: string; user: StoredAuthUser };
    saveAuthSession(accessToken, userData);
    window.sessionStorage.setItem('poultryflow-login-alert', '1');
    setToken(accessToken);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    clearAllCachedPageData();
    localStorage.removeItem(REPORT_CACHE_STORAGE_KEY);
    window.sessionStorage.removeItem('poultryflow-login-alert');
    clearAuthSession();
    setToken(null);
    setUser(null);
    window.location.replace('/login');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
