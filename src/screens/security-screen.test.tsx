import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import SecurityScreen from '@/app/(app)/security';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const mockSignOut = jest.fn();
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}));

const mockUseMyProfile = jest.fn();
jest.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: () => mockUseMyProfile(),
}));

const mockUseMfa = jest.fn();
jest.mock('@/hooks/use-mfa', () => ({
  useMfa: () => mockUseMfa(),
}));

const userProfile = {
  id: 'user-1',
  username: 'kenjiro47',
  displayName: 'Kenjiro',
  avatarUrl: null,
  avatarPath: null,
  role: 'user' as const,
};

const ownerProfile = { ...userProfile, id: 'owner-1', role: 'owner' as const };

function profileState(overrides: Partial<ReturnType<typeof mockUseMyProfile>> = {}) {
  return { profile: userProfile, isLoading: false, error: null, refresh: jest.fn(), setProfile: jest.fn(), ...overrides };
}

function mfaState(overrides: Partial<ReturnType<typeof mockUseMfa>> = {}) {
  return {
    status: { currentLevel: 'aal1', nextLevel: 'aal1', verifiedFactors: [] },
    isLoading: false,
    error: null,
    refresh: jest.fn(),
    enrollment: null,
    isStartingEnrollment: false,
    enrollmentError: null,
    startEnrollment: jest.fn(),
    cancelEnrollment: jest.fn(),
    isVerifying: false,
    verifyError: null,
    confirmEnrollment: jest.fn(),
    pendingDisableFactorId: null,
    startDisable: jest.fn(),
    cancelDisable: jest.fn(),
    isDisabling: false,
    disableError: null,
    confirmDisable: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SecurityScreen — compte user', () => {
  it("n'affiche aucune option d'administration ni de badge Propriétaire", async () => {
    mockUseMyProfile.mockReturnValue(profileState());
    mockUseMfa.mockReturnValue(mfaState());

    await render(<SecurityScreen />);

    await screen.findByText(/Aucune option d.administration/);
    expect(screen.queryByText('Propriétaire')).toBeNull();
    expect(screen.queryByText('Configurer l’authentification')).toBeNull();
  });
});

describe('SecurityScreen — compte owner', () => {
  it('affiche le badge Propriétaire et l’état MFA non configuré avec un bouton pour configurer', async () => {
    mockUseMyProfile.mockReturnValue(profileState({ profile: ownerProfile }));
    mockUseMfa.mockReturnValue(mfaState());

    await render(<SecurityScreen />);

    await screen.findByText('Propriétaire');
    await screen.findByText('Non configuré');
    expect(screen.getByText('Configurer l’authentification')).toBeTruthy();
  });

  it('bouton Configurer déclenche startEnrollment', async () => {
    const startEnrollment = jest.fn();
    mockUseMyProfile.mockReturnValue(profileState({ profile: ownerProfile }));
    mockUseMfa.mockReturnValue(mfaState({ startEnrollment }));

    await render(<SecurityScreen />);
    fireEvent.press(await screen.findByText('Configurer l’authentification'));

    expect(startEnrollment).toHaveBeenCalledTimes(1);
  });

  it('pendant l’enrôlement : affiche le QR code et le secret, jamais après validation', async () => {
    const confirmEnrollment = jest.fn().mockResolvedValue(true);
    mockUseMyProfile.mockReturnValue(profileState({ profile: ownerProfile }));
    mockUseMfa.mockReturnValue(
      mfaState({
        enrollment: { factorId: 'factor-1', qrCodeDataUri: 'data:image/svg+xml;utf-8,x', secret: 'JBSWY3DPEHPK3PXP' },
        confirmEnrollment,
      }),
    );

    await render(<SecurityScreen />);

    await screen.findByLabelText(/Code QR/);
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeTruthy();

    const input = screen.getByPlaceholderText('Code à 6 chiffres');
    fireEvent.changeText(input, '123456');
    await waitFor(() => expect(input.props.value).toBe('123456'));

    // act() async englobe aussi bien fireEvent.press que la résolution de la
    // promesse confirmEnrollment déclenchée par onPress (et le setState qui
    // en découle), pour que React 19 le reconnaisse comme un seul batch de
    // mise à jour testé — évite l'avertissement "not wrapped in act(...)".
    await act(async () => {
      fireEvent.press(screen.getByText('Vérifier'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(confirmEnrollment).toHaveBeenCalledWith('123456');
    expect(screen.getByText('Authentification multifacteur activée.')).toBeTruthy();
  });

  it('code incorrect pendant l’enrôlement : message affiché, le QR reste visible pour réessayer', async () => {
    mockUseMyProfile.mockReturnValue(profileState({ profile: ownerProfile }));
    mockUseMfa.mockReturnValue(
      mfaState({
        enrollment: { factorId: 'factor-1', qrCodeDataUri: 'data:image/svg+xml;utf-8,x', secret: 'JBSWY3DPEHPK3PXP' },
        verifyError: "Code incorrect. Vérifie l'heure de ton appareil et réessaie.",
      }),
    );

    await render(<SecurityScreen />);

    await screen.findByText(/Code incorrect/);
    expect(screen.getByLabelText(/Code QR/)).toBeTruthy();
  });

  it('facteur déjà vérifié : affiche Vérifié et un bouton Désactiver qui déclenche startDisable', async () => {
    const startDisable = jest.fn();
    mockUseMyProfile.mockReturnValue(profileState({ profile: ownerProfile }));
    mockUseMfa.mockReturnValue(
      mfaState({
        status: { currentLevel: 'aal2', nextLevel: 'aal2', verifiedFactors: [{ id: 'factor-1', createdAt: 't' }] },
        startDisable,
      }),
    );

    await render(<SecurityScreen />);
    await screen.findByText('Vérifié');
    fireEvent.press(screen.getByText('Désactiver'));

    expect(startDisable).toHaveBeenCalledWith('factor-1');
  });

  it('désactivation en attente de revérification : saisir un code déclenche confirmDisable', async () => {
    const confirmDisable = jest.fn().mockResolvedValue(true);
    mockUseMyProfile.mockReturnValue(profileState({ profile: ownerProfile }));
    mockUseMfa.mockReturnValue(
      mfaState({
        status: { currentLevel: 'aal2', nextLevel: 'aal2', verifiedFactors: [{ id: 'factor-1', createdAt: 't' }] },
        pendingDisableFactorId: 'factor-1',
        confirmDisable,
      }),
    );

    await render(<SecurityScreen />);
    await screen.findByText(/Désactiver l.authentification multifacteur/);

    const input = screen.getByPlaceholderText('Code à 6 chiffres');
    fireEvent.changeText(input, '654321');
    await waitFor(() => expect(input.props.value).toBe('654321'));

    fireEvent.press(screen.getByText('Confirmer la désactivation'));

    await waitFor(() => expect(confirmDisable).toHaveBeenCalledWith('654321'));
  });
});

describe('SecurityScreen — cohérence de l’état MFA', () => {
  it('aal2 sans aucun facteur vérifié (état incohérent) : déconnexion immédiate', async () => {
    mockUseMyProfile.mockReturnValue(profileState({ profile: ownerProfile }));
    mockUseMfa.mockReturnValue(mfaState({ status: { currentLevel: 'aal2', nextLevel: 'aal2', verifiedFactors: [] } }));

    await render(<SecurityScreen />);

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it('aal1 sans facteur vérifié (état normal, non configuré) : pas de déconnexion', async () => {
    mockUseMyProfile.mockReturnValue(profileState({ profile: ownerProfile }));
    mockUseMfa.mockReturnValue(mfaState());

    await render(<SecurityScreen />);
    await screen.findByText('Non configuré');

    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

describe('SecurityScreen — chargement et erreur', () => {
  it('affiche un état de chargement tant que le profil ou le statut MFA ne sont pas prêts', async () => {
    mockUseMyProfile.mockReturnValue(profileState({ isLoading: true, profile: null }));
    mockUseMfa.mockReturnValue(mfaState({ isLoading: true, status: null }));

    await render(<SecurityScreen />);

    expect(screen.getByLabelText('Chargement de la sécurité du compte')).toBeTruthy();
  });

  it('affiche une erreur récupérable avec un bouton Réessayer', async () => {
    const refreshProfile = jest.fn();
    const refreshMfa = jest.fn();
    mockUseMyProfile.mockReturnValue(profileState({ error: 'Impossible de charger le profil pour le moment.', refresh: refreshProfile }));
    mockUseMfa.mockReturnValue(mfaState({ refresh: refreshMfa }));

    await render(<SecurityScreen />);
    await screen.findByText('Impossible de charger le profil pour le moment.');

    fireEvent.press(screen.getByText('Réessayer'));

    expect(refreshProfile).toHaveBeenCalledTimes(1);
    expect(refreshMfa).toHaveBeenCalledTimes(1);
  });
});

describe('SecurityScreen — navigation', () => {
  it('bouton Retour appelle router.back', async () => {
    mockUseMyProfile.mockReturnValue(profileState());
    mockUseMfa.mockReturnValue(mfaState());

    await render(<SecurityScreen />);
    fireEvent.press(screen.getByText('Retour'));

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
