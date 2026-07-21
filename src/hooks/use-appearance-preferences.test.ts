import { act, renderHook, waitFor } from '@testing-library/react-native';

import { DEFAULT_APPEARANCE_PREFERENCES } from '@/constants/appearance';
import { useAppearancePreferences } from '@/hooks/use-appearance-preferences';
import {
  getAppearancePreferences,
  resetAppearancePreferences,
  saveAppearancePreferences,
} from '@/lib/appearance-storage';
import type { AppearancePreferences } from '@/types/appearance';

jest.mock('@/lib/appearance-storage', () => ({
  getAppearancePreferences: jest.fn(),
  saveAppearancePreferences: jest.fn(),
  resetAppearancePreferences: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useAppearancePreferences', () => {
  it('expose deja les valeurs par defaut de maniere synchrone (etat initial), avant meme la fin du chargement', async () => {
    (getAppearancePreferences as jest.Mock).mockReturnValue(new Promise(() => {})); // jamais résolue dans ce test

    const { result } = await renderHook(() => useAppearancePreferences());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.preferences).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
  });

  it('preferences absentes : isLoading passe a false, les valeurs restent les valeurs par defaut', async () => {
    (getAppearancePreferences as jest.Mock).mockResolvedValue(DEFAULT_APPEARANCE_PREFERENCES);

    const { result } = await renderHook(() => useAppearancePreferences());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.preferences).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
  });

  it('preferences deja personnalisees et valides : chargees telles quelles', async () => {
    const stored: AppearancePreferences = { ...DEFAULT_APPEARANCE_PREFERENCES, themeMode: 'dark', textScale: 1.15 };
    (getAppearancePreferences as jest.Mock).mockResolvedValue(stored);

    const { result } = await renderHook(() => useAppearancePreferences());

    await waitFor(() => expect(result.current.preferences).toEqual(stored));
  });

  it('preferences corrompues : getAppearancePreferences a deja assaini en amont, le hook ne fait que refleter la valeur recue', async () => {
    // `getAppearancePreferences` retombe lui-même sur les valeurs par défaut
    // en cas de JSON corrompu (voir appearance-storage.test.ts) : le hook n'a
    // donc rien de spécial à faire, il affiche simplement ce qui lui est
    // renvoyé.
    (getAppearancePreferences as jest.Mock).mockResolvedValue(DEFAULT_APPEARANCE_PREFERENCES);

    const { result } = await renderHook(() => useAppearancePreferences());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.preferences).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
  });

  it('updatePreferences met a jour immediatement (optimiste) puis persiste', async () => {
    (getAppearancePreferences as jest.Mock).mockResolvedValue(DEFAULT_APPEARANCE_PREFERENCES);
    (saveAppearancePreferences as jest.Mock).mockResolvedValue(undefined);

    const { result } = await renderHook(() => useAppearancePreferences());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updatePreferences({ themeMode: 'dark', textScale: 1.2 });
    });

    expect(result.current.preferences.themeMode).toBe('dark');
    expect(result.current.preferences.textScale).toBe(1.2);
    expect(saveAppearancePreferences).toHaveBeenCalledWith(
      expect.objectContaining({ themeMode: 'dark', textScale: 1.2 }),
    );
  });

  it('resetPreferences revient aux valeurs par defaut', async () => {
    const customized: AppearancePreferences = { ...DEFAULT_APPEARANCE_PREFERENCES, themeMode: 'light' };
    (getAppearancePreferences as jest.Mock).mockResolvedValue(customized);
    (resetAppearancePreferences as jest.Mock).mockResolvedValue(DEFAULT_APPEARANCE_PREFERENCES);

    const { result } = await renderHook(() => useAppearancePreferences());
    await waitFor(() => expect(result.current.preferences).toEqual(customized));

    await act(async () => {
      await result.current.resetPreferences();
    });

    expect(resetAppearancePreferences).toHaveBeenCalled();
    expect(result.current.preferences).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
  });
});
