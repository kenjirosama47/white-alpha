import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';

import AppearanceScreen from '@/app/(app)/appearance';
import { DEFAULT_APPEARANCE_PREFERENCES } from '@/constants/appearance';
import { Colors } from '@/constants/theme';
import { AppearanceContext, type AppearanceContextValue } from '@/contexts/appearance-context';
import type { AppearancePreferences } from '@/types/appearance';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

function flattenStyle(style: unknown): Record<string, unknown> {
  return ([style] as unknown[])
    .flat(Infinity)
    .filter(Boolean)
    .reduce((acc, s) => ({ ...(acc as object), ...(s as object) }), {}) as Record<string, unknown>;
}

/** Contexte statique (jest.fn() n'affecte jamais réellement `preferences`) : pour les assertions "updatePreferences/resetPreferences a été appelé avec X". */
function staticContextValue(overrides: Partial<AppearanceContextValue> = {}): AppearanceContextValue {
  return {
    preferences: DEFAULT_APPEARANCE_PREFERENCES,
    isLoading: false,
    updatePreferences: jest.fn().mockResolvedValue(undefined),
    resetPreferences: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Contexte réellement réactif (état React local, jamais AsyncStorage) : pour
 * prouver que l'aperçu se met à jour en temps réel après un changement —
 * exactement le même contrat que le vrai `AppearanceProvider` (Phase 10.2),
 * sans dépendre du stockage.
 */
function TestAppearanceProvider({
  initial,
  children,
}: PropsWithChildren<{ initial?: AppearancePreferences }>) {
  const [preferences, setPreferences] = useState<AppearancePreferences>(initial ?? DEFAULT_APPEARANCE_PREFERENCES);

  const value: AppearanceContextValue = {
    preferences,
    isLoading: false,
    updatePreferences: async (partial) => {
      setPreferences((prev) => ({ ...prev, ...partial }));
    },
    resetPreferences: async () => {
      setPreferences(DEFAULT_APPEARANCE_PREFERENCES);
    },
  };

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AppearanceScreen — ouverture et chargement', () => {
  it("ouverture de l'écran : affiche le titre, l'aperçu et les réglages", async () => {
    await render(
      <AppearanceContext.Provider value={staticContextValue()}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    expect(screen.getByText('Apparence')).toBeTruthy();
    expect(screen.getByLabelText("Aperçu de l'apparence : thème, couleurs des bulles et du bouton")).toBeTruthy();
    expect(screen.getByLabelText('Thème clair ou sombre')).toBeTruthy();
    expect(screen.getByLabelText('Taille du texte')).toBeTruthy();
    expect(screen.getByText('Couleur principale')).toBeTruthy();
    expect(screen.getByText('Réinitialiser')).toBeTruthy();
  });

  it('chargement des préférences : affiche un état de chargement propre tant que isLoading est vrai', async () => {
    await render(
      <AppearanceContext.Provider value={staticContextValue({ isLoading: true })}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    expect(screen.getByLabelText("Chargement des préférences d'apparence")).toBeTruthy();
    expect(screen.queryByText('Réinitialiser')).toBeNull();
  });

  it('stockage corrompu (repli déjà appliqué en amont sur les valeurs par défaut) : l’écran s’affiche normalement, sans erreur', async () => {
    await render(
      <AppearanceContext.Provider value={staticContextValue({ preferences: DEFAULT_APPEARANCE_PREFERENCES })}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    expect(screen.getByLabelText('Système').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByLabelText('Normal').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
  });
});

describe('AppearanceScreen — aperçu en temps réel', () => {
  it('le fond de l’aperçu suit le thème clair/sombre choisi, immédiatement', async () => {
    await render(
      <TestAppearanceProvider initial={{ ...DEFAULT_APPEARANCE_PREFERENCES, themeMode: 'system' }}>
        <AppearanceScreen />
      </TestAppearanceProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Sombre'));
      await Promise.resolve();
    });

    const phone = screen.getByText('White Alpha').parent;
    expect(flattenStyle(phone?.props.style).backgroundColor).toBe(Colors.dark.background);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Clair'));
      await Promise.resolve();
    });

    expect(flattenStyle(screen.getByText('White Alpha').parent?.props.style).backgroundColor).toBe(
      Colors.light.background,
    );
  });

  it('choisir une couleur de bulle envoyée met immédiatement à jour l’aperçu', async () => {
    await render(
      <TestAppearanceProvider>
        <AppearanceScreen />
      </TestAppearanceProvider>,
    );

    await act(async () => {
      // 4 rangées de préréglages (principale/boutons/bulles envoyées/bulles
      // reçues) partagent le même catalogue : index 2 = "Bulles envoyées"
      // (voir COLOR_TARGETS dans app/(app)/appearance.tsx).
      fireEvent.press(screen.getAllByLabelText('Bleu ardoise')[2]);
      await Promise.resolve();
    });

    const sentBubble = screen.getByText('Oui, et toi ?').parent;
    expect(flattenStyle(sentBubble?.props.style).backgroundColor).toBe('#3B5B7A');
  });
});

describe('AppearanceScreen — réglages', () => {
  it('thème clair : sélectionner "Clair" appelle updatePreferences avec themeMode "light"', async () => {
    const updatePreferences = jest.fn().mockResolvedValue(undefined);
    await render(
      <AppearanceContext.Provider value={staticContextValue({ updatePreferences })}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Clair'));
      await Promise.resolve();
    });

    expect(updatePreferences).toHaveBeenCalledWith({ themeMode: 'light' });
  });

  it('thème sombre : sélectionner "Sombre" appelle updatePreferences avec themeMode "dark"', async () => {
    const updatePreferences = jest.fn().mockResolvedValue(undefined);
    await render(
      <AppearanceContext.Provider value={staticContextValue({ updatePreferences })}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Sombre'));
      await Promise.resolve();
    });

    expect(updatePreferences).toHaveBeenCalledWith({ themeMode: 'dark' });
  });

  it('changement de couleur : choisir un préset pour "Couleur principale" appelle updatePreferences avec accentColor', async () => {
    const updatePreferences = jest.fn().mockResolvedValue(undefined);
    await render(
      <AppearanceContext.Provider value={staticContextValue({ updatePreferences })}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    await act(async () => {
      fireEvent.press(screen.getAllByLabelText('Ambre')[0]);
      await Promise.resolve();
    });

    expect(updatePreferences).toHaveBeenCalledWith({ accentColor: '#B08A3E' });
  });

  it('changement de taille de texte : sélectionner "Grand" appelle updatePreferences avec textScale 1.15', async () => {
    const updatePreferences = jest.fn().mockResolvedValue(undefined);
    await render(
      <AppearanceContext.Provider value={staticContextValue({ updatePreferences })}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Grand'));
      await Promise.resolve();
    });

    expect(updatePreferences).toHaveBeenCalledWith({ textScale: 1.15 });
  });
});

describe('AppearanceScreen — sauvegarde, réinitialisation et erreurs', () => {
  it('sauvegarde : après un changement réussi, affiche une confirmation discrète', async () => {
    await render(
      <AppearanceContext.Provider value={staticContextValue()}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Sombre'));
      await Promise.resolve();
    });

    expect(screen.getByText('Modifications enregistrées.')).toBeTruthy();
  });

  it('reset : le bouton Réinitialiser appelle resetPreferences et affiche une confirmation', async () => {
    const resetPreferences = jest.fn().mockResolvedValue(undefined);
    await render(
      <AppearanceContext.Provider value={staticContextValue({ resetPreferences })}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByText('Réinitialiser'));
      await Promise.resolve();
    });

    expect(resetPreferences).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Préférences réinitialisées.')).toBeTruthy();
  });

  it('affiche un message d’erreur accessible si la sauvegarde locale échoue, sans faire planter l’écran', async () => {
    const updatePreferences = jest.fn().mockRejectedValue(new Error('Stockage local indisponible.'));
    await render(
      <AppearanceContext.Provider value={staticContextValue({ updatePreferences })}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Sombre'));
      await Promise.resolve();
    });

    expect(screen.getByText('Stockage local indisponible.').props.accessibilityRole).toBe('alert');
    expect(screen.queryByText('Modifications enregistrées.')).toBeNull();
  });
});

describe('AppearanceScreen — navigation', () => {
  it('bouton Retour appelle router.back', async () => {
    await render(
      <AppearanceContext.Provider value={staticContextValue()}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    fireEvent.press(screen.getByText('Retour'));

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
