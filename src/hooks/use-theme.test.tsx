import { renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { DEFAULT_APPEARANCE_PREFERENCES } from '@/constants/appearance';
import { Colors } from '@/constants/theme';
import { AppearanceContext, type AppearanceContextValue } from '@/contexts/appearance-context';
import { useTheme } from '@/hooks/use-theme';
import type { AppearancePreferences } from '@/types/appearance';

const mockUseColorScheme = jest.fn();
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockUseColorScheme(),
}));

function wrapperWithPreferences(preferences: AppearancePreferences) {
  const value: AppearanceContextValue = {
    preferences,
    isLoading: false,
    updatePreferences: jest.fn(),
    resetPreferences: jest.fn(),
  };
  return function Wrapper({ children }: PropsWithChildren) {
    return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
  };
}

beforeEach(() => {
  mockUseColorScheme.mockReturnValue('light');
});

describe('useTheme (Phase 10.2 — branchement des préférences d’apparence)', () => {
  it("sans AppearanceProvider (comme les tests de composants isolés existants, ex. button.test.tsx) : retombe sur les valeurs par défaut, identiques à Colors.light", async () => {
    const { result } = await renderHook(() => useTheme());

    expect(result.current.background).toBe(Colors.light.background);
    expect(result.current.accent).toBe(DEFAULT_APPEARANCE_PREFERENCES.accentColor);
    expect(result.current.buttonColor).toBe(DEFAULT_APPEARANCE_PREFERENCES.buttonColor);
    expect(result.current.bubbleSentColor).toBe(DEFAULT_APPEARANCE_PREFERENCES.bubbleSentColor);
    expect(result.current.bubbleReceivedColor).toBe(DEFAULT_APPEARANCE_PREFERENCES.bubbleReceivedColor);
    expect(result.current.textScale).toBe(1);
  });

  it('thème clair : suit le système quand themeMode = "system"', async () => {
    mockUseColorScheme.mockReturnValue('light');
    const preferences = { ...DEFAULT_APPEARANCE_PREFERENCES, themeMode: 'system' as const };

    const { result } = await renderHook(() => useTheme(), { wrapper: wrapperWithPreferences(preferences) });

    expect(result.current.background).toBe(Colors.light.background);
    expect(result.current.text).toBe(Colors.light.text);
  });

  it('thème sombre : suit le système quand themeMode = "system"', async () => {
    mockUseColorScheme.mockReturnValue('dark');
    const preferences = { ...DEFAULT_APPEARANCE_PREFERENCES, themeMode: 'system' as const };

    const { result } = await renderHook(() => useTheme(), { wrapper: wrapperWithPreferences(preferences) });

    expect(result.current.background).toBe(Colors.dark.background);
    expect(result.current.text).toBe(Colors.dark.text);
  });

  it('themeMode "dark" explicite l’emporte sur un système en clair', async () => {
    mockUseColorScheme.mockReturnValue('light');
    const preferences = { ...DEFAULT_APPEARANCE_PREFERENCES, themeMode: 'dark' as const };

    const { result } = await renderHook(() => useTheme(), { wrapper: wrapperWithPreferences(preferences) });

    expect(result.current.background).toBe(Colors.dark.background);
  });

  it('themeMode "light" explicite l’emporte sur un système en sombre', async () => {
    mockUseColorScheme.mockReturnValue('dark');
    const preferences = { ...DEFAULT_APPEARANCE_PREFERENCES, themeMode: 'light' as const };

    const { result } = await renderHook(() => useTheme(), { wrapper: wrapperWithPreferences(preferences) });

    expect(result.current.background).toBe(Colors.light.background);
  });

  it('forcedScheme reste prioritaire sur themeMode utilisateur (environnement de conversation toujours sombre)', async () => {
    mockUseColorScheme.mockReturnValue('light');
    const preferences = { ...DEFAULT_APPEARANCE_PREFERENCES, themeMode: 'light' as const };

    const { result } = await renderHook(() => useTheme('dark'), { wrapper: wrapperWithPreferences(preferences) });

    expect(result.current.background).toBe(Colors.dark.background);
  });

  it('couleurs personnalisées (principale, boutons, bulles envoyées/reçues) appliquées', async () => {
    const preferences: AppearancePreferences = {
      ...DEFAULT_APPEARANCE_PREFERENCES,
      accentColor: '#112233',
      buttonColor: '#445566',
      bubbleSentColor: '#778899',
      bubbleReceivedColor: '#aabbcc',
    };

    const { result } = await renderHook(() => useTheme(), { wrapper: wrapperWithPreferences(preferences) });

    expect(result.current.accent).toBe('#112233');
    expect(result.current.buttonColor).toBe('#445566');
    expect(result.current.bubbleSentColor).toBe('#778899');
    expect(result.current.bubbleReceivedColor).toBe('#aabbcc');
  });

  it('les couleurs de bulles personnalisées restent appliquées même sous forcedScheme (deux axes indépendants : palette imposée vs couleurs choisies)', async () => {
    const preferences: AppearancePreferences = { ...DEFAULT_APPEARANCE_PREFERENCES, bubbleSentColor: '#123456' };

    const { result } = await renderHook(() => useTheme('dark'), { wrapper: wrapperWithPreferences(preferences) });

    expect(result.current.bubbleSentColor).toBe('#123456');
    expect(result.current.background).toBe(Colors.dark.background);
  });

  it('échelle de texte exposée telle quelle', async () => {
    const preferences = { ...DEFAULT_APPEARANCE_PREFERENCES, textScale: 1.15 };

    const { result } = await renderHook(() => useTheme(), { wrapper: wrapperWithPreferences(preferences) });

    expect(result.current.textScale).toBe(1.15);
  });

  it('expose les préférences complètes ayant produit le thème', async () => {
    const preferences = { ...DEFAULT_APPEARANCE_PREFERENCES, themeMode: 'dark' as const };

    const { result } = await renderHook(() => useTheme(), { wrapper: wrapperWithPreferences(preferences) });

    expect(result.current.preferences).toEqual(preferences);
  });
});
