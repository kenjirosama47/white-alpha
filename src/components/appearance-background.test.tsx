import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppearanceBackground, resolveOverlayOpacity } from '@/components/appearance-background';
import { DEFAULT_APPEARANCE_PREFERENCES } from '@/constants/appearance';
import { AppearanceContext, type AppearanceContextValue } from '@/contexts/appearance-context';
import type { AppearancePreferences } from '@/types/appearance';

jest.mock('@/constants/decorations', () => ({
  resolveDecorationSource: jest.fn(() => 42),
}));

jest.mock('@/lib/personal-photo-storage', () => ({
  personalPhotoFileExists: jest.fn(() => true),
}));

function contextValue(preferences: AppearancePreferences): AppearanceContextValue {
  return {
    preferences,
    isLoading: false,
    updatePreferences: jest.fn().mockResolvedValue(undefined),
    resetPreferences: jest.fn().mockResolvedValue(undefined),
  };
}

async function renderWithBackgrounds(
  backgrounds: AppearancePreferences['backgrounds'],
  slot: 'home' | 'conversation' | 'profile',
  forcedScheme?: 'light' | 'dark',
) {
  const preferences: AppearancePreferences = { ...DEFAULT_APPEARANCE_PREFERENCES, backgrounds };
  return render(
    <AppearanceContext.Provider value={contextValue(preferences)}>
      <AppearanceBackground slot={slot} forcedScheme={forcedScheme} testID="bg">
        <Text>Contenu de l&apos;écran</Text>
      </AppearanceBackground>
    </AppearanceContext.Provider>,
  );
}

// Correctif intégration (voir cause dans appearance.tsx/PLAN.md) : avant ce
// composant, Accueil/Conversation/Profil n'affichaient jamais le fond
// sélectionné, seul l'aperçu de l'écran Apparence le faisait. Ces tests
// verrouillent le partage réel entre les 3 sections.
describe('AppearanceBackground — rendu par section', () => {
  const defaultBackgrounds = {
    home: { kind: 'default' as const },
    conversation: { kind: 'default' as const },
    profile: { kind: 'default' as const },
  };

  it("rend un fond uni (pas d'image) quand la section est en 'default'", async () => {
    await renderWithBackgrounds(defaultBackgrounds, 'home');

    expect(screen.queryByTestId('bg-image')).toBeNull();
    expect(screen.getByText("Contenu de l'écran")).toBeTruthy();
  });

  it("rend l'image du catalogue (via expo-image, correctif A5) quand la section a un fond 'catalog'", async () => {
    await renderWithBackgrounds({ ...defaultBackgrounds, home: { kind: 'catalog', decorationId: 'wolves_gaze' } }, 'home');

    // expo-image normalise en interne toute source (numérique ou { uri })
    // en tableau — on vérifie qu'une source a bien été transmise, pas la
    // représentation exacte du mock RN de résolution d'asset (détail
    // d'implémentation, pas un comportement métier de ce composant).
    const image = screen.getByTestId('bg-image');
    expect(image.props.source).toBeTruthy();
    expect(image.props.contentFit).toBe('cover');
  });

  it("rend la photo personnelle (via expo-image, correctif A5) quand la section a un fond 'personal'", async () => {
    await renderWithBackgrounds(
      { ...defaultBackgrounds, profile: { kind: 'personal', localUri: 'file:///mock/private/appearance-photos/a.jpg' } },
      'profile',
    );

    const image = screen.getByTestId('bg-image');
    expect(image.props.source).toEqual(
      expect.arrayContaining([expect.objectContaining({ uri: 'file:///mock/private/appearance-photos/a.jpg' })]),
    );
    expect(image.props.contentFit).toBe('cover');
  });

  it('ne lit que le fond de SA section : un fond personnalisé sur "conversation" ne modifie jamais "home"', async () => {
    await renderWithBackgrounds(
      { ...defaultBackgrounds, conversation: { kind: 'catalog', decorationId: 'wolves_gaze' } },
      'home',
    );

    expect(screen.queryByTestId('bg-image')).toBeNull();
  });

  it('affiche toujours ses enfants, avec ou sans image de fond', async () => {
    await renderWithBackgrounds({ ...defaultBackgrounds, home: { kind: 'catalog', decorationId: 'wolves_gaze' } }, 'home');

    expect(screen.getByText("Contenu de l'écran")).toBeTruthy();
  });
});

// Correctif A4 : le voile de lisibilité fixe (0.35 partout) sur-assombrissait
// l'écran de conversation (forcedScheme="dark"), déjà sombre par sa propre
// palette — cumul de deux noirs rendant le fond choisi à peine visible.
describe('AppearanceBackground — voile de lisibilité adaptatif (correctif A4)', () => {
  const backgroundsWithCatalog = {
    home: { kind: 'catalog' as const, decorationId: 'wolves_gaze' },
    conversation: { kind: 'catalog' as const, decorationId: 'wolves_gaze' },
    profile: { kind: 'default' as const },
  };

  it("resolveOverlayOpacity('light') reste à la valeur historique (0.35) : Accueil/Profil ne régressent pas", () => {
    expect(resolveOverlayOpacity('light')).toBe(0.35);
  });

  it("resolveOverlayOpacity('dark') est allégée par rapport à 'light' : le fond reste visible sous forcedScheme sombre", () => {
    const dark = resolveOverlayOpacity('dark');
    const light = resolveOverlayOpacity('light');

    expect(dark).toBeLessThan(light);
    expect(dark).toBeGreaterThan(0);
  });

  it("le voile appliqué sur l'écran Accueil (palette claire) utilise l'opacité 'light'", async () => {
    await renderWithBackgrounds(backgroundsWithCatalog, 'home', 'light');

    const overlay = screen.getByTestId('bg-overlay');
    const flatStyle = [overlay.props.style].flat();
    expect(flatStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: `rgba(0, 0, 0, ${resolveOverlayOpacity('light')})` })]),
    );
  });

  it("le voile appliqué sur l'écran Conversation (forcedScheme sombre) utilise l'opacité 'dark', pas 'light'", async () => {
    await renderWithBackgrounds(backgroundsWithCatalog, 'conversation', 'dark');

    const overlay = screen.getByTestId('bg-overlay');
    const flatStyle = [overlay.props.style].flat();
    expect(flatStyle).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: `rgba(0, 0, 0, ${resolveOverlayOpacity('dark')})` })]),
    );
  });
});
