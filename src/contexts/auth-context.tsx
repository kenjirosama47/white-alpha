import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { supabase } from '@/lib/supabase';

type AuthResult = { error: string | null };

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, username: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Email ou mot de passe incorrect.',
  'Email not confirmed': 'Adresse email non confirmée. Vérifie ta boîte mail.',
  'User already registered': 'Un compte existe déjà avec cet email.',
  'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères.',
  'Unable to validate email address: invalid format': 'Adresse email invalide.',
};

function translateAuthError(message: string): string {
  return KNOWN_ERROR_MESSAGES[message] ?? 'Une erreur est survenue. Réessaie.';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: !!session,
      isLoading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error ? translateAuthError(error.message) : null };
      },
      async signUp(email, password, username) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        return { error: error ? translateAuthError(error.message) : null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
