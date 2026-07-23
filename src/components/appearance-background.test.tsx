import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppearanceBackground } from '@/components/appearance-background';
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
) {
  const preferences: AppearancePreferences = { ...DEFAULT_APPEARANCE_PREFERENCES, backgrounds };
  return render(
    <AppearanceContext.Provider value={contextValue(preferences)}>
      <AppearanceBackground slot={slot} testID="bg">
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

    const node = screen.getByTestId('bg');
    expect(node.props.source).toBeUndefined();
    expect(screen.getByText("Contenu de l'écran")).toBeTruthy();
  });

  it("rend l'image du catalogue quand la section a un fond 'catalog'", async () => {
    await renderWithBackgrounds({ ...defaultBackgrounds, home: { kind: 'catalog', decorationId: 'wolves_gaze' } }, 'home');

    const node = screen.getByTestId('bg');
    expect(node.props.source).toBe(42);
  });

  it("rend la photo personnelle quand la section a un fond 'personal'", async () => {
    await renderWithBackgrounds(
      { ...defaultBackgrounds, profile: { kind: 'personal', localUri: 'file:///mock/private/appearance-photos/a.jpg' } },
      'profile',
    );

    const node = screen.getByTestId('bg');
    expect(node.props.source).toEqual({ uri: 'file:///mock/private/appearance-photos/a.jpg' });
  });

  it('ne lit que le fond de SA section : un fond personnalisé sur "conversation" ne modifie jamais "home"', async () => {
    await renderWithBackgrounds(
      { ...defaultBackgrounds, conversation: { kind: 'catalog', decorationId: 'wolves_gaze' } },
      'home',
    );

    const node = screen.getByTestId('bg');
    expect(node.props.source).toBeUndefined();
  });

  it('affiche toujours ses enfants, avec ou sans image de fond', async () => {
    await renderWithBackgrounds({ ...defaultBackgrounds, home: { kind: 'catalog', decorationId: 'wolves_gaze' } }, 'home');

    expect(screen.getByText("Contenu de l'écran")).toBeTruthy();
  });
});
