import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import supabase from '../utils/supabase';
import { authAPI, setApiToken } from '../utils/api';

const AuthContext = createContext(null);

const AUTH_CACHE_KEY = 'ves_auth_cache';
const AUTH_CACHE_TTL = 60_000; // 60 seconds

function getImpersonateId() {
  return localStorage.getItem('ves_impersonate_id') || '';
}

function getCachedAuth() {
  try {
    const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const { user, timestamp, impersonateId } = JSON.parse(raw);
    // Invalidate if impersonation state changed
    if ((impersonateId || '') !== getImpersonateId()) {
      sessionStorage.removeItem(AUTH_CACHE_KEY);
      return null;
    }
    if (Date.now() - timestamp < AUTH_CACHE_TTL && user) {
      return user;
    }
    // Stale — remove it
    sessionStorage.removeItem(AUTH_CACHE_KEY);
    return null;
  } catch {
    sessionStorage.removeItem(AUTH_CACHE_KEY);
    return null;
  }
}

function setCachedAuth(user) {
  try {
    sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({
      user,
      timestamp: Date.now(),
      impersonateId: getImpersonateId(),
    }));
  } catch { /* ignore quota errors */ }
}

function clearCachedAuth() {
  sessionStorage.removeItem(AUTH_CACHE_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Track whether initAuth has fetched user to avoid duplicate call from onAuthStateChange
  const initFetched = useRef(false);

  const fetchUser = useCallback(async ({ skipCache = false } = {}) => {
    // Check sessionStorage cache first (unless explicitly skipping)
    if (!skipCache) {
      const cached = getCachedAuth();
      if (cached) {
        setUser(cached);
        return;
      }
    }
    try {
      const data = await authAPI.getMe();
      setUser(data.user);
      setCachedAuth(data.user);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      setUser(null);
      clearCachedAuth();
    }
  }, []);

  useEffect(() => {
    // Check for existing session on mount
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setApiToken(session?.access_token || null);
      if (session) {
        await fetchUser();
        initFetched.current = true;
      }
      setLoading(false);
    };

    initAuth();

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setApiToken(session?.access_token || null);
        if (event === 'SIGNED_IN' && session) {
          // On mount, Supabase fires SIGNED_IN for existing sessions too.
          // If initAuth already handled this, skip the duplicate call.
          if (initFetched.current) {
            initFetched.current = false; // Reset so future genuine sign-ins work
            return;
          }
          // Fresh sign-in (magic link callback) — skip cache to get fresh data
          await fetchUser({ skipCache: true });
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          clearCachedAuth();
        } else if (event === 'TOKEN_REFRESHED' && session) {
          // Token refreshed — user data hasn't changed, use cache if available
          await fetchUser();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchUser]);

  const login = async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
    // No immediate user — they need to click the magic link
  };

  const logout = async () => {
    clearCachedAuth();
    await supabase.auth.signOut();
    setApiToken(null);
    await authAPI.logout(); // Clear server-side impersonation cookie if any
    setUser(null);
  };

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    setCachedAuth(updatedUser);
  };

  const refreshUser = async () => {
    await fetchUser({ skipCache: true });
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
