import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import { deactivateCurrentDevicePushTokenAsync, registerForPushNotificationsAsync } from '@/lib/push-notifications';
import { clearStoredSession, logAuthStorageEvent, migrateLegacySessionToSecureStore } from '@/lib/secure-session-storage';
import { AUTH_CALLBACK_URL, SESSION_STORAGE_KEY, supabase } from '@/lib/supabase';

type AuthResult = { error: string | null };

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, username: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
  resendConfirmation: (email: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Email ou mot de passe incorrect.',
  'Email not confirmed': 'Adresse email non confirmée. Vérifie ta boîte mail.',
  'User already registered': 'Un compte existe déjà avec cet email.',
  'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères.',
  'Unable to validate email address: invalid format': 'Adresse email invalide.',
  'Email link is invalid or has expired': 'Le lien de confirmation est invalide ou a expiré.',
};

function translateAuthError(message: string): string {
  if (KNOWN_ERROR_MESSAGES[message]) {
    return KNOWN_ERROR_MESSAGES[message];
  }
  if (/security purposes|after \d+ seconds/i.test(message)) {
    return 'Trop de tentatives : merci de patienter quelques instants avant de réessayer.';
  }
  return 'Une erreur est survenue. Réessaie.';
}

/** Erreur générique unique pour toute défaillance inattendue (réseau, stockage) — jamais le détail interne Supabase ni un jeton. */
const UNEXPECTED_ERROR_MESSAGE = 'Une erreur est survenue. Réessaie.';

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      // Migration unique (natif uniquement, no-op sur web) : doit se
      // terminer avant le premier getSession(), sinon une session valide
      // laissée dans l'ancien AsyncStorage semblerait absente.
      await migrateLegacySessionToSecureStore(SESSION_STORAGE_KEY);

      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;
        setSession(data.session);
        logAuthStorageEvent(data.session ? 'Lecture de session réussie.' : 'Session absente.');
        // Best-effort, jamais bloquant pour le démarrage : réenregistre ou
        // réactive le token de cet appareil si une session existe déjà
        // (permission déjà accordée/refusée précédemment, pas de nouvelle
        // demande si déjà tranchée — voir requestPushPermissionAsync).
        if (data.session) void registerForPushNotificationsAsync();
      } catch {
        // Session illisible/corrompue (échec de stockage, pas juste une
        // valeur invalide déjà gérée par le SDK) : jamais de boucle de
        // démarrage bloquée dessus — nettoyage local puis écran de connexion.
        if (!isMounted) return;
        await clearStoredSession(SESSION_STORAGE_KEY);
        setSession(null);
        logAuthStorageEvent('Session invalide, nettoyage local effectué.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: !!session,
      isLoading,
      async signIn(email, password) {
        try {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (!error) void registerForPushNotificationsAsync();
          return { error: error ? translateAuthError(error.message) : null };
        } catch {
          logAuthStorageEvent('Connexion échouée (réseau ou stockage).');
          return { error: UNEXPECTED_ERROR_MESSAGE };
        }
      },
      async signUp(email, password, username) {
        try {
          const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { username }, emailRedirectTo: AUTH_CALLBACK_URL },
          });
          return { error: error ? translateAuthError(error.message) : null };
        } catch {
          logAuthStorageEvent('Inscription échouée (réseau ou stockage).');
          return { error: UNEXPECTED_ERROR_MESSAGE };
        }
      },
      async signOut() {
        // Désactive uniquement le token de cet appareil, jamais les autres
        // appareils du même utilisateur — avant même de tenter la
        // déconnexion distante, pour ne jamais laisser un appareil déconnecté
        // continuer de recevoir des notifications privées. Best-effort :
        // n'empêche jamais la déconnexion elle-même en cas d'échec réseau.
        await deactivateCurrentDevicePushTokenAsync();

        try {
          const { error } = await supabase.auth.signOut();
          if (error) {
            logAuthStorageEvent('Déconnexion échouée (réponse du serveur).');
            return { error: 'Impossible de se déconnecter pour le moment. Réessaie.' };
          }
          setSession(null);
          logAuthStorageEvent('Déconnexion réussie.');
          return { error: null };
        } catch {
          // Échec réseau ou de stockage pendant la déconnexion : on ne
          // prétend jamais que la déconnexion distante a réussi, mais on
          // force un nettoyage local pour ne jamais laisser une session
          // utilisable sur cet appareil (voir Phase 5.S1, section 8).
          await clearStoredSession(SESSION_STORAGE_KEY);
          setSession(null);
          logAuthStorageEvent('Déconnexion échouée (réseau ou stockage), nettoyage local effectué.');
          return { error: 'Impossible de se déconnecter pour le moment. Réessaie.' };
        }
      },
      async resendConfirmation(email) {
        try {
          const { error } = await supabase.auth.resend({
            type: 'signup',
            email,
            options: { emailRedirectTo: AUTH_CALLBACK_URL },
          });
          return { error: error ? translateAuthError(error.message) : null };
        } catch {
          logAuthStorageEvent('Renvoi de confirmation échoué (réseau ou stockage).');
          return { error: UNEXPECTED_ERROR_MESSAGE };
        }
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
