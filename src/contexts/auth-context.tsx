import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

/**
 * TEMPORAIRE — Phase 1 uniquement.
 *
 * Ce contexte simule une session d'authentification en mémoire, sans backend.
 * Il ne contient aucune clé, aucun identifiant réel et aucune donnée persistée.
 * Il sera entièrement remplacé en Phase 2 par une session Supabase réelle
 * (voir PLAN.md).
 */
type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: () => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      isLoading: false,
      signIn: () => setIsAuthenticated(true),
      signOut: () => setIsAuthenticated(false),
    }),
    [isAuthenticated],
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
