import AsyncStorage from '@react-native-async-storage/async-storage';

import { APPEARANCE_STORAGE_KEY, DEFAULT_APPEARANCE_PREFERENCES } from '@/constants/appearance';
import {
  getAppearancePreferences,
  resetAppearancePreferences,
  saveAppearancePreferences,
  sanitizeAppearancePreferences,
} from '@/lib/appearance-storage';
import type { AppearancePreferences } from '@/types/appearance';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;
const mockRemoveItem = AsyncStorage.removeItem as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getAppearancePreferences', () => {
  it('renvoie les valeurs par defaut si rien n’est stocke', async () => {
    mockGetItem.mockResolvedValue(null);

    const result = await getAppearancePreferences();

    expect(result).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
  });

  it('renvoie les valeurs par defaut si le stockage local est indisponible', async () => {
    mockGetItem.mockRejectedValue(new Error('stockage indisponible'));

    const result = await getAppearancePreferences();

    expect(result).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
  });

  it('renvoie les valeurs par defaut si le contenu stocke est un JSON invalide', async () => {
    mockGetItem.mockResolvedValue('{ceci nest pas du json');

    const result = await getAppearancePreferences();

    expect(result).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
  });

  it('lit et revalide des preferences valides deja stockees', async () => {
    const stored: AppearancePreferences = {
      ...DEFAULT_APPEARANCE_PREFERENCES,
      themeMode: 'dark',
      accentColor: '#123456',
      textScale: 1.2,
    };
    mockGetItem.mockResolvedValue(JSON.stringify(stored));

    const result = await getAppearancePreferences();

    expect(result).toEqual(stored);
  });

  it('retombe sur les valeurs par defaut champ par champ pour un schemaVersion inconnu sans chemin de migration', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({ schemaVersion: 0, themeMode: 'dark' }));

    const result = await getAppearancePreferences();

    // Aucune migration enregistree depuis la version 0 : la revalidation
    // s'applique telle quelle (themeMode est conserve car valide), le reste
    // retombe sur les valeurs par defaut.
    expect(result).toEqual({ ...DEFAULT_APPEARANCE_PREFERENCES, themeMode: 'dark' });
  });

  it('ne plante jamais sur un schemaVersion futur inconnu (avance arriere compatible)', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({ schemaVersion: 999, themeMode: 'light' }));

    const result = await getAppearancePreferences();

    expect(result).toEqual({ ...DEFAULT_APPEARANCE_PREFERENCES, themeMode: 'light' });
  });
});

describe('sanitizeAppearancePreferences', () => {
  it('rejette un themeMode invalide', () => {
    const result = sanitizeAppearancePreferences({ themeMode: 'neon' });
    expect(result.themeMode).toBe(DEFAULT_APPEARANCE_PREFERENCES.themeMode);
  });

  it('rejette une couleur qui n’est pas un hexadecimal #RRGGBB', () => {
    const result = sanitizeAppearancePreferences({ accentColor: 'not-a-color', buttonColor: '#zzzzzz' });
    expect(result.accentColor).toBe(DEFAULT_APPEARANCE_PREFERENCES.accentColor);
    expect(result.buttonColor).toBe(DEFAULT_APPEARANCE_PREFERENCES.buttonColor);
  });

  it('accepte une couleur hexadecimale valide', () => {
    const result = sanitizeAppearancePreferences({ accentColor: '#AABBCC' });
    expect(result.accentColor).toBe('#AABBCC');
  });

  it('borne les niveaux numeriques (flou, assombrissement, opacite, taille de texte) dans leurs limites', () => {
    const result = sanitizeAppearancePreferences({
      blurLevel: 5,
      darkenLevel: -3,
      cardOpacity: 10,
      textScale: 0.1,
    });
    expect(result.blurLevel).toBe(1);
    expect(result.darkenLevel).toBe(0);
    expect(result.cardOpacity).toBe(1);
    expect(result.textScale).toBe(0.85);
  });

  it('retombe sur la valeur par defaut pour un niveau numerique non numerique', () => {
    const result = sanitizeAppearancePreferences({ blurLevel: 'beaucoup' });
    expect(result.blurLevel).toBe(DEFAULT_APPEARANCE_PREFERENCES.blurLevel);
  });

  it('accepte un fond catalogue avec un decorationId reconnu (Phase 10.4)', () => {
    const result = sanitizeAppearancePreferences({
      backgrounds: { home: { kind: 'catalog', decorationId: 'forest_canopy' } },
    });
    expect(result.backgrounds.home).toEqual({ kind: 'catalog', decorationId: 'forest_canopy' });
  });

  it('rejette un fond catalogue sans decorationId', () => {
    const result = sanitizeAppearancePreferences({ backgrounds: { home: { kind: 'catalog' } } });
    expect(result.backgrounds.home).toEqual(DEFAULT_APPEARANCE_PREFERENCES.backgrounds.home);
  });

  it('rejette un decorationId qui ne correspond a aucune entree du catalogue (Phase 10.4 — identifiant invalide)', () => {
    const result = sanitizeAppearancePreferences({
      backgrounds: { conversation: { kind: 'catalog', decorationId: 'fond-invente-qui-nexiste-pas' } },
    });
    expect(result.backgrounds.conversation).toEqual(DEFAULT_APPEARANCE_PREFERENCES.backgrounds.conversation);
  });

  it('accepte un fond personnel avec un chemin de fichier local', () => {
    const result = sanitizeAppearancePreferences({
      backgrounds: { profile: { kind: 'personal', localUri: 'file:///data/user/0/app/cache/photo.jpg' } },
    });
    expect(result.backgrounds.profile).toEqual({
      kind: 'personal',
      localUri: 'file:///data/user/0/app/cache/photo.jpg',
    });
  });

  it('rejette un fond personnel dont l’URI est une URL http(s) distante (jamais une URL signee stockee)', () => {
    const result = sanitizeAppearancePreferences({
      backgrounds: { conversation: { kind: 'personal', localUri: 'https://example.com/signed-url' } },
    });
    expect(result.backgrounds.conversation).toEqual(DEFAULT_APPEARANCE_PREFERENCES.backgrounds.conversation);
  });

  it('rejette un avatarPreset hors catalogue', () => {
    const result = sanitizeAppearancePreferences({ avatarPreset: 'wolf_inexistant' });
    expect(result.avatarPreset).toBe(DEFAULT_APPEARANCE_PREFERENCES.avatarPreset);
  });

  it('ignore toute cle inconnue sans jamais la reporter dans le resultat', () => {
    const result = sanitizeAppearancePreferences({ secretToken: 'ne-doit-jamais-apparaitre' });
    expect(result).not.toHaveProperty('secretToken');
  });

  it('force toujours schemaVersion a la version courante', () => {
    const result = sanitizeAppearancePreferences({ schemaVersion: 42 });
    expect(result.schemaVersion).toBe(DEFAULT_APPEARANCE_PREFERENCES.schemaVersion);
  });
});

describe('saveAppearancePreferences', () => {
  it('revalide puis ecrit les preferences sous la cle attendue', async () => {
    mockSetItem.mockResolvedValue(undefined);
    const preferences: AppearancePreferences = { ...DEFAULT_APPEARANCE_PREFERENCES, textScale: 50 };

    await saveAppearancePreferences(preferences);

    expect(mockSetItem).toHaveBeenCalledWith(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_APPEARANCE_PREFERENCES, textScale: 1.3 }),
    );
  });

  it('leve une erreur explicite si l’ecriture locale echoue', async () => {
    mockSetItem.mockRejectedValue(new Error('disque plein'));

    await expect(saveAppearancePreferences(DEFAULT_APPEARANCE_PREFERENCES)).rejects.toThrow();
  });
});

describe('resetAppearancePreferences', () => {
  it('supprime l’entree locale et renvoie les valeurs par defaut', async () => {
    mockRemoveItem.mockResolvedValue(undefined);

    const result = await resetAppearancePreferences();

    expect(mockRemoveItem).toHaveBeenCalledWith(APPEARANCE_STORAGE_KEY);
    expect(result).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
  });

  it('renvoie tout de meme les valeurs par defaut si la suppression locale echoue', async () => {
    mockRemoveItem.mockRejectedValue(new Error('stockage indisponible'));

    const result = await resetAppearancePreferences();

    expect(result).toEqual(DEFAULT_APPEARANCE_PREFERENCES);
  });
});
