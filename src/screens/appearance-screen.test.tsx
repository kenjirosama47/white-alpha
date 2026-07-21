import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';

import AppearanceScreen from '@/app/(app)/appearance';
import { DEFAULT_APPEARANCE_PREFERENCES } from '@/constants/appearance';
import { Colors } from '@/constants/theme';
import { DECORATION_CATEGORIES, getDecorationsByCategory, resolveDecorationSource } from '@/constants/decorations';
import { AppearanceContext, type AppearanceContextValue } from '@/contexts/appearance-context';
import type { AppearancePreferences } from '@/types/appearance';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

// `resolveDecorationSource`/`getDecorationsByCategory` restent le VRAI
// catalogue par défaut (jest.fn() enveloppant l'implémentation réelle) :
// seuls 2 tests ci-dessous ("ressource absente", "état vide propre")
// substituent temporairement leur valeur de retour, puis la restaurent
// explicitement en fin de test — jamais `jest.resetModules()` (romprait le
// dispatcher de hooks React partagé par les autres tests de ce fichier, voir
// le commentaire de root-layout-module-load.test.tsx).
const actualDecorations = jest.requireActual('@/constants/decorations');
jest.mock('@/constants/decorations', () => {
  const actual = jest.requireActual('@/constants/decorations');
  return {
    ...actual,
    resolveDecorationSource: jest.fn(actual.resolveDecorationSource),
    getDecorationsByCategory: jest.fn(actual.getDecorationsByCategory),
  };
});

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
    expect(
      screen.getByLabelText("Aperçu de l'apparence pour accueil : thème, fond d'écran, couleurs des bulles et du bouton"),
    ).toBeTruthy();
    expect(screen.getByLabelText('Section à personnaliser')).toBeTruthy();
    expect(screen.getByLabelText('Catégories de décorations')).toBeTruthy();
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

    expect(flattenStyle(screen.getByTestId('appearance-preview-background').props.style).backgroundColor).toBe(
      Colors.dark.background,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Clair'));
      await Promise.resolve();
    });

    expect(flattenStyle(screen.getByTestId('appearance-preview-background').props.style).backgroundColor).toBe(
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

describe('AppearanceScreen — galerie de décorations (Phase 10.4)', () => {
  it('affichage des catégories : les 8 catégories sont affichées, navigables par onglets', async () => {
    await render(
      <AppearanceContext.Provider value={staticContextValue()}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    for (const category of DECORATION_CATEGORIES) {
      expect(screen.getByLabelText(category.label).props.accessibilityRole).toBe('tab');
    }
  });

  it('affichage des miniatures : la catégorie active affiche ses fonds avec un libellé accessible', async () => {
    await render(
      <AppearanceContext.Provider value={staticContextValue()}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    // Catégorie active par défaut : la première (« White Alpha »).
    for (const entry of getDecorationsByCategory(DECORATION_CATEGORIES[0].id)) {
      expect(screen.getByLabelText(entry.label)).toBeTruthy();
    }
  });

  it('sélection d’un fond : appuyer sur une miniature appelle updatePreferences avec le fond choisi pour la section active', async () => {
    const updatePreferences = jest.fn().mockResolvedValue(undefined);
    await render(
      <AppearanceContext.Provider value={staticContextValue({ updatePreferences })}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    const [firstDecoration] = getDecorationsByCategory(DECORATION_CATEGORIES[0].id);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(firstDecoration.label));
      await Promise.resolve();
    });

    expect(updatePreferences).toHaveBeenCalledWith({
      backgrounds: {
        ...DEFAULT_APPEARANCE_PREFERENCES.backgrounds,
        home: { kind: 'catalog', decorationId: firstDecoration.id },
      },
    });
  });

  it('persistance locale : conserve les fonds déjà choisis sur les autres sections (fusion, pas d’écrasement)', async () => {
    const updatePreferences = jest.fn().mockResolvedValue(undefined);
    const preferences: AppearancePreferences = {
      ...DEFAULT_APPEARANCE_PREFERENCES,
      backgrounds: {
        ...DEFAULT_APPEARANCE_PREFERENCES.backgrounds,
        conversation: { kind: 'catalog', decorationId: 'night_sky_moon' },
      },
    };
    await render(
      <AppearanceContext.Provider value={staticContextValue({ preferences, updatePreferences })}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    const [firstDecoration] = getDecorationsByCategory(DECORATION_CATEGORIES[0].id);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(firstDecoration.label));
      await Promise.resolve();
    });

    expect(updatePreferences).toHaveBeenCalledWith({
      backgrounds: expect.objectContaining({
        conversation: { kind: 'catalog', decorationId: 'night_sky_moon' },
        home: { kind: 'catalog', decorationId: firstDecoration.id },
      }),
    });
  });

  it('application séparée par section : changer de section affiche/édite un fond indépendant (aperçu en temps réel)', async () => {
    await render(
      <TestAppearanceProvider>
        <AppearanceScreen />
      </TestAppearanceProvider>,
    );

    const [firstDecoration] = getDecorationsByCategory(DECORATION_CATEGORIES[0].id);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(firstDecoration.label));
      await Promise.resolve();
    });

    // Fond appliqué à « Accueil » : l’aperçu (toujours sur « Accueil » par
    // défaut) passe d’une couleur unie à une image de fond.
    expect(screen.getByTestId('appearance-preview-background').props.source).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Profil'));
      await Promise.resolve();
    });

    // Bascule sur « Profil » : aucun fond choisi pour cette section, aucune
    // miniature n’y est marquée sélectionnée (indépendance des 2 sections).
    expect(screen.getByLabelText(firstDecoration.label).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
    expect(screen.getByTestId('appearance-preview-background').props.source).toBeFalsy();
  });

  it('reset vers le fond par défaut : le bouton dédié restaure « default » pour la section active uniquement', async () => {
    const updatePreferences = jest.fn().mockResolvedValue(undefined);
    const preferences: AppearancePreferences = {
      ...DEFAULT_APPEARANCE_PREFERENCES,
      backgrounds: {
        home: { kind: 'catalog', decorationId: 'white_alpha_glow' },
        conversation: { kind: 'catalog', decorationId: 'night_sky_moon' },
        profile: { kind: 'default' },
      },
    };
    await render(
      <AppearanceContext.Provider value={staticContextValue({ preferences, updatePreferences })}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Revenir au fond par défaut pour accueil'));
      await Promise.resolve();
    });

    expect(updatePreferences).toHaveBeenCalledWith({
      backgrounds: {
        home: { kind: 'default' },
        conversation: { kind: 'catalog', decorationId: 'night_sky_moon' },
        profile: { kind: 'default' },
      },
    });
  });

  it('identifiant de fond invalide : ne fait planter ni la galerie ni l’aperçu, aucune miniature marquée sélectionnée', async () => {
    const preferences: AppearancePreferences = {
      ...DEFAULT_APPEARANCE_PREFERENCES,
      backgrounds: {
        ...DEFAULT_APPEARANCE_PREFERENCES.backgrounds,
        home: { kind: 'catalog', decorationId: 'fond-invente-qui-nexiste-pas' },
      },
    };

    await render(
      <AppearanceContext.Provider value={staticContextValue({ preferences })}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    for (const entry of getDecorationsByCategory(DECORATION_CATEGORIES[0].id)) {
      expect(screen.getByLabelText(entry.label).props.accessibilityState).toEqual(
        expect.objectContaining({ selected: false }),
      );
    }
    // Aucune source résolue pour un identifiant inconnu : repli sur la couleur unie, jamais une erreur.
    expect(screen.getByTestId('appearance-preview-background').props.source).toBeFalsy();
  });

  it('ressource absente : la vignette retombe sur son libellé (repli neutre), jamais une erreur de bundling', async () => {
    (resolveDecorationSource as jest.Mock).mockReturnValue(null);

    try {
      await render(
        <AppearanceContext.Provider value={staticContextValue()}>
          <AppearanceScreen />
        </AppearanceContext.Provider>,
      );

      const [firstDecoration] = getDecorationsByCategory(DECORATION_CATEGORIES[0].id);
      expect(screen.getByText(firstDecoration.label)).toBeTruthy();
    } finally {
      (resolveDecorationSource as jest.Mock).mockImplementation(actualDecorations.resolveDecorationSource);
    }
  });

  it('état vide propre : une catégorie sans décoration affiche un message clair, jamais une galerie cassée', async () => {
    (getDecorationsByCategory as jest.Mock).mockReturnValue([]);

    try {
      await render(
        <AppearanceContext.Provider value={staticContextValue()}>
          <AppearanceScreen />
        </AppearanceContext.Provider>,
      );

      expect(screen.getByText('Aucun fond disponible dans cette catégorie pour le moment.')).toBeTruthy();
    } finally {
      (getDecorationsByCategory as jest.Mock).mockImplementation(actualDecorations.getDecorationsByCategory);
    }
  });

  it('accessibilité : le bouton « Fond par défaut » a un libellé explicite et se désactive quand le fond est déjà par défaut', async () => {
    await render(
      <AppearanceContext.Provider value={staticContextValue()}>
        <AppearanceScreen />
      </AppearanceContext.Provider>,
    );

    const resetButton = screen.getByLabelText('Revenir au fond par défaut pour accueil');
    expect(resetButton.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
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
