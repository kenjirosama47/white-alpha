import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { AuthProvider, useAuth } from '@/contexts/auth-context';

const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockSignOut = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockUnsubscribe = jest.fn();
const mockResetPasswordForEmail = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      resetPasswordForEmail: (...args: unknown[]) => mockResetPasswordForEmail(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
  },
  AUTH_CALLBACK_URL: 'whitealpha://auth/callback',
  SESSION_STORAGE_KEY: 'sb-testproj-auth-token',
}));

const mockClearStoredSession = jest.fn();
const mockMigrateLegacySessionToSecureStore = jest.fn();
jest.mock('@/lib/secure-session-storage', () => ({
  clearStoredSession: (...args: unknown[]) => mockClearStoredSession(...args),
  logAuthStorageEvent: jest.fn(),
  migrateLegacySessionToSecureStore: (...args: unknown[]) => mockMigrateLegacySessionToSecureStore(...args),
}));

const mockRegisterForPushNotifications = jest.fn();
const mockDeactivateCurrentDevicePushToken = jest.fn();
jest.mock('@/lib/push-notifications', () => ({
  registerForPushNotificationsAsync: (...args: unknown[]) => mockRegisterForPushNotifications(...args),
  deactivateCurrentDevicePushTokenAsync: (...args: unknown[]) => mockDeactivateCurrentDevicePushToken(...args),
}));

const fakeSession = {
  access_token: 'fake-token',
  refresh_token: 'fake-refresh',
  user: { id: 'user-1' },
} as never;

function AuthProbe() {
  const { session, isAuthenticated, isLoading, signOut } = useAuth();
  return (
    <>
      <Text>{isLoading ? 'loading' : 'loaded'}</Text>
      <Text>{isAuthenticated ? 'authenticated' : 'unauthenticated'}</Text>
      <Text>{session?.user.id ?? 'no-session'}</Text>
      <Pressable onPress={() => signOut()}>
        <Text>Se déconnecter</Text>
      </Pressable>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMigrateLegacySessionToSecureStore.mockResolvedValue(undefined);
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: mockUnsubscribe } } });
  mockDeactivateCurrentDevicePushToken.mockResolvedValue(undefined);
});

describe('AuthProvider — chargement initial', () => {
  it('exécute la migration locale avant le premier getSession()', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('loaded')).toBeTruthy());
    expect(mockMigrateLegacySessionToSecureStore).toHaveBeenCalledWith('sb-testproj-auth-token');
    expect(mockMigrateLegacySessionToSecureStore).toHaveBeenCalledTimes(1);
  });

  it('persistance après redémarrage simulé : une session déjà stockée est restaurée', async () => {
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

    await render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('authenticated')).toBeTruthy());
    expect(screen.getByText('user-1')).toBeTruthy();
  });

  it('session absente : pas authentifié, pas de blocage', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeTruthy());
    expect(screen.getByText('loaded')).toBeTruthy();
  });

  it("session illisible/corrompue (getSession lève) : nettoyage local, retour à l'état déconnecté, aucune boucle de démarrage", async () => {
    mockGetSession.mockRejectedValue(new Error('SecureStore decrypt failure'));
    mockClearStoredSession.mockResolvedValue(undefined);

    await render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('loaded')).toBeTruthy());
    expect(screen.getByText('unauthenticated')).toBeTruthy();
    expect(mockClearStoredSession).toHaveBeenCalledWith('sb-testproj-auth-token');
  });

  it("nettoie l'abonnement Realtime/auth au démontage", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { unmount } = await render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('loaded')).toBeTruthy());

    await act(async () => {
      unmount();
      await Promise.resolve();
    });

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('AuthProvider — signOut', () => {
  it('signOut réussi : session locale vidée', async () => {
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
    mockSignOut.mockResolvedValue({ error: null });

    await render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('authenticated')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Se déconnecter'));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeTruthy());
  });

  it('signOut : le serveur renvoie une erreur -> message français générique, jamais le détail interne', async () => {
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
    mockSignOut.mockResolvedValue({ error: { message: 'gotrue internal detail xyz' } });

    let capturedResult: { error: string | null } | undefined;
    function Consumer() {
      const { signOut } = useAuth();
      return (
        <Pressable
          onPress={async () => {
            capturedResult = await signOut();
          }}>
          <Text>go</Text>
        </Pressable>
      );
    }

    await render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('go'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(capturedResult?.error).toBe('Impossible de se déconnecter pour le moment. Réessaie.');
    expect(capturedResult?.error).not.toContain('gotrue internal detail');
  });

  it('signOut : échec réseau (exception) -> ne prétend pas avoir réussi côté serveur, mais force un nettoyage local', async () => {
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
    mockSignOut.mockRejectedValue(new Error('Network request failed'));
    mockClearStoredSession.mockResolvedValue(undefined);

    await render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('authenticated')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Se déconnecter'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeTruthy());
    expect(mockClearStoredSession).toHaveBeenCalledWith('sb-testproj-auth-token');
  });
});

describe('AuthProvider — cycle de vie du token push', () => {
  it('session déjà existante au démarrage : tente de (ré)enregistrer le token de cet appareil (best-effort)', async () => {
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });

    await render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(mockRegisterForPushNotifications).toHaveBeenCalledTimes(1));
  });

  it('aucune session au démarrage : aucune tentative d\'enregistrement de token', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    await render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('loaded')).toBeTruthy());
    expect(mockRegisterForPushNotifications).not.toHaveBeenCalled();
  });

  it('signIn réussi : tente d\'enregistrer le token de cet appareil', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInWithPassword.mockResolvedValue({ error: null });

    function SignInConsumer() {
      const { signIn } = useAuth();
      return (
        <Pressable onPress={() => signIn('a@test.local', 'password')}>
          <Text>connexion</Text>
        </Pressable>
      );
    }

    await render(
      <AuthProvider>
        <SignInConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('connexion'));
      await Promise.resolve();
    });

    expect(mockRegisterForPushNotifications).toHaveBeenCalledTimes(1);
  });

  it('signIn échoué (identifiants invalides) : aucune tentative d\'enregistrement de token', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    function SignInConsumer() {
      const { signIn } = useAuth();
      return (
        <Pressable onPress={() => signIn('a@test.local', 'wrong')}>
          <Text>connexion</Text>
        </Pressable>
      );
    }

    await render(
      <AuthProvider>
        <SignInConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('connexion'));
      await Promise.resolve();
    });

    expect(mockRegisterForPushNotifications).not.toHaveBeenCalled();
  });

  it('signOut : désactive le token de cet appareil avant de terminer la déconnexion', async () => {
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
    mockSignOut.mockResolvedValue({ error: null });

    await render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('authenticated')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByText('Se déconnecter'));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByText('unauthenticated')).toBeTruthy());
    expect(mockDeactivateCurrentDevicePushToken).toHaveBeenCalledTimes(1);
  });
});

describe('AuthProvider — requestPasswordReset (Phase 7.3)', () => {
  function ResetConsumer() {
    const { requestPasswordReset } = useAuth();
    const [result, setResult] = useState<{ error: string | null } | null>(null);
    return (
      <>
        <Pressable onPress={async () => setResult(await requestPasswordReset('a@test.local'))}>
          <Text>envoyer</Text>
        </Pressable>
        <Text>{result ? result.error ?? 'ok' : 'attente'}</Text>
      </>
    );
  }

  it('succès : appelle resetPasswordForEmail avec le redirectTo attendu', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockResetPasswordForEmail.mockResolvedValue({ error: null });

    await render(
      <AuthProvider>
        <ResetConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('envoyer'));
      await Promise.resolve();
    });

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('a@test.local', {
      redirectTo: 'whitealpha://auth/callback',
    });
    expect(screen.getByText('ok')).toBeTruthy();
  });

  it('erreur technique : message générique, jamais le détail brut', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'gotrue internal rate limit detail' } });

    await render(
      <AuthProvider>
        <ResetConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('envoyer'));
      await Promise.resolve();
    });

    expect(screen.queryByText('gotrue internal rate limit detail')).toBeNull();
  });
});

describe('AuthProvider — updatePassword (Phase 7.3)', () => {
  function UpdatePasswordConsumer() {
    const { updatePassword } = useAuth();
    const [result, setResult] = useState<{ error: string | null } | null>(null);
    return (
      <>
        <Pressable onPress={async () => setResult(await updatePassword('NouveauMotDePasse123'))}>
          <Text>confirmer</Text>
        </Pressable>
        <Text>{result ? result.error ?? 'ok' : 'attente'}</Text>
      </>
    );
  }

  it('succès : appelle updateUser avec le nouveau mot de passe', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockUpdateUser.mockResolvedValue({ error: null });

    await render(
      <AuthProvider>
        <UpdatePasswordConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('confirmer'));
      await Promise.resolve();
    });

    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NouveauMotDePasse123' });
    expect(screen.getByText('ok')).toBeTruthy();
  });

  it('mot de passe identique à l\'ancien : message traduit explicite', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockUpdateUser.mockResolvedValue({
      error: { message: 'New password should be different from the old password.' },
    });

    await render(
      <AuthProvider>
        <UpdatePasswordConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('confirmer'));
      await Promise.resolve();
    });

    expect(screen.getByText("Le nouveau mot de passe doit être différent de l'ancien.")).toBeTruthy();
  });
});
