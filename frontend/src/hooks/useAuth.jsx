import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import supabase from '../utils/supabase';
import { authAPI, setApiToken } from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const data = await authAPI.getMe();
      setUser(data.user);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // Check for existing session on mount
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setApiToken(session?.access_token || null);
      if (session) {
        await fetchUser();
      }
      setLoading(false);
    };

    initAuth();

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setApiToken(session?.access_token || null);
        if (event === 'SIGNED_IN' && session) {
          await fetchUser();
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
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
    await supabase.auth.signOut();
    setApiToken(null);
    await authAPI.logout(); // Clear server-side impersonation cookie if any
    setUser(null);
  };

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
  };

  const refreshUser = async () => {
    await fetchUser();
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
