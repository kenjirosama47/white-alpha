import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import NotificationsScreen from '@/app/(app)/notifications';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const mockUseNotificationPreferences = jest.fn();
jest.mock('@/hooks/use-notification-preferences', () => ({
  useNotificationPreferences: () => mockUseNotificationPreferences(),
}));

const mockRegisterForPush = jest.fn();
const mockEnsureChannel = jest.fn();
jest.mock('@/lib/push-notifications', () => ({
  registerForPushNotificationsAsync: (...args: unknown[]) => mockRegisterForPush(...args),
  ensureAndroidNotificationChannelAsync: (...args: unknown[]) => mockEnsureChannel(...args),
}));

const defaults = { notificationsEnabled: true, lockScreenPreview: false, soundEnabled: true };

function preferencesState(overrides: Partial<ReturnType<typeof mockUseNotificationPreferences>> = {}) {
  return {
    preferences: defaults,
    isLoading: false,
    isSaving: false,
    error: null,
    refresh: jest.fn(),
    update: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NotificationsScreen — chargement et erreur', () => {
  it('affiche un état de chargement tant que les préférences ne sont pas prêtes', async () => {
    mockUseNotificationPreferences.mockReturnValue(preferencesState({ isLoading: true, preferences: null }));

    await render(<NotificationsScreen />);

    expect(screen.getByLabelText('Chargement des préférences de notification')).toBeTruthy();
  });

  it('affiche une erreur récupérable avec un bouton Réessayer', async () => {
    const refresh = jest.fn();
    mockUseNotificationPreferences.mockReturnValue(
      preferencesState({ preferences: null, error: 'Impossible de charger les préférences de notification.', refresh }),
    );

    await render(<NotificationsScreen />);
    await screen.findByText('Impossible de charger les préférences de notification.');
    fireEvent.press(screen.getByText('Réessayer'));

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationsScreen — contenu et confidentialité', () => {
  it("ne contient aucune référence visible à Claude", async () => {
    mockUseNotificationPreferences.mockReturnValue(preferencesState());

    await render(<NotificationsScreen />);

    expect(screen.queryByText(/claude/i)).toBeNull();
  });

  it('affiche le rappel de contenu générique par défaut', async () => {
    mockUseNotificationPreferences.mockReturnValue(preferencesState());

    await render(<NotificationsScreen />);

    await screen.findByText(/Nouveau message/);
  });
});

describe('NotificationsScreen — bascules', () => {
  it('activer les notifications appelle update puis tente d\'enregistrer le token (best-effort)', async () => {
    const update = jest.fn().mockResolvedValue(true);
    mockUseNotificationPreferences.mockReturnValue(
      preferencesState({ preferences: { ...defaults, notificationsEnabled: false }, update }),
    );

    await render(<NotificationsScreen />);
    const switches = screen.getAllByRole('switch');

    await act(async () => {
      fireEvent(switches[0], 'valueChange', true);
      await Promise.resolve();
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ notificationsEnabled: true }));
    expect(mockRegisterForPush).toHaveBeenCalled();
  });

  it('désactiver les notifications appelle update sans tenter d\'enregistrer le token', async () => {
    const update = jest.fn().mockResolvedValue(true);
    mockUseNotificationPreferences.mockReturnValue(preferencesState({ update }));

    await render(<NotificationsScreen />);
    const switches = screen.getAllByRole('switch');

    await act(async () => {
      fireEvent(switches[0], 'valueChange', false);
      await Promise.resolve();
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ notificationsEnabled: false }));
    expect(mockRegisterForPush).not.toHaveBeenCalled();
  });

  it('les bascules aperçu écran verrouillé et son sont désactivées quand les notifications sont désactivées', async () => {
    mockUseNotificationPreferences.mockReturnValue(
      preferencesState({ preferences: { ...defaults, notificationsEnabled: false } }),
    );

    await render(<NotificationsScreen />);
    const switches = screen.getAllByRole('switch');

    expect(switches[1].props.disabled).toBe(true);
    expect(switches[2].props.disabled).toBe(true);
  });
});

describe('NotificationsScreen — navigation', () => {
  it('bouton Retour appelle router.back', async () => {
    mockUseNotificationPreferences.mockReturnValue(preferencesState());

    await render(<NotificationsScreen />);
    fireEvent.press(screen.getByText('Retour'));

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
