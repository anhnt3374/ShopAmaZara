import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { authStorage } from '../services/api.js';
import * as authService from '../services/auth.js';

const AuthContext = createContext(null);

function loadInitial() {
  if (typeof window === 'undefined') return { token: null, user: null };
  try {
    const token = window.localStorage.getItem(authStorage.TOKEN_KEY);
    const userRaw = window.localStorage.getItem(authStorage.USER_KEY);
    const user = userRaw ? JSON.parse(userRaw) : null;
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

function persist({ token, user }) {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(authStorage.TOKEN_KEY, token);
    else window.localStorage.removeItem(authStorage.TOKEN_KEY);
    if (user) window.localStorage.setItem(authStorage.USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(authStorage.USER_KEY);
  } catch {
    /* ignore quota */
  }
}

export function AuthProvider({ children }) {
  const [{ token, user }, setState] = useState(loadInitial);

  useEffect(() => {
    persist({ token, user });
  }, [token, user]);

  const login = useCallback(async (credentials) => {
    const res = await authService.login(credentials);
    setState({ token: res.accessToken, user: res.user });
    return res.user;
  }, []);

  const register = useCallback(async (input) => {
    const res = await authService.register(input);
    setState({ token: res.accessToken, user: res.user });
    return res.user;
  }, []);

  const logout = useCallback(() => {
    setState({ token: null, user: null });
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
    }),
    [token, user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
