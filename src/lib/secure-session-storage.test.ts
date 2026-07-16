import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { clearStoredSession, logAuthStorageEvent, migrateLegacySessionToSecureStore, secureStorageAdapter } from '@/lib/secure-session-storage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const STORAGE_KEY = 'sb-testproj-auth-token';
const FAKE_ACCESS_TOKEN = 'fake-access-token-value-should-never-appear-in-logs';
const FAKE_SESSION_JSON = JSON.stringify({
  access_token: FAKE_ACCESS_TOKEN,
  refresh_token: 'fake-refresh-token-value',
  token_type: 'bearer',
  expires_at: 9999999999,
  user: { id: 'user-1' },
});

const originalPlatformOS = Platform.OS;

let consoleLogSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  Platform.OS = originalPlatformOS;
  consoleLogSpy.mockRestore();
});

describe('logAuthStorageEvent', () => {
  it('journalise uniquement une catégorie générique, jamais de contenu sensible', () => {
    logAuthStorageEvent('Session absente.');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = consoleLogSpy.mock.calls[0].join(' ');
    expect(loggedArgs).toContain('Session absente.');
    expect(loggedArgs).not.toContain(FAKE_ACCESS_TOKEN);
  });
});

describe('secureStorageAdapter (SupportedStorage)', () => {
  it('getItem utilise SecureStore.getItemAsync et renvoie sa valeur', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(FAKE_SESSION_JSON);

    const result = await secureStorageAdapter.getItem(STORAGE_KEY);

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(STORAGE_KEY);
    expect(result).toBe(FAKE_SESSION_JSON);
  });

  it('setItem utilise SecureStore.setItemAsync avec la clé et la valeur exactes', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    await secureStorageAdapter.setItem(STORAGE_KEY, FAKE_SESSION_JSON);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(STORAGE_KEY, FAKE_SESSION_JSON);
  });

  it('removeItem utilise SecureStore.deleteItemAsync', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

    await secureStorageAdapter.removeItem(STORAGE_KEY);

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it("getItem : un échec SecureStore n'est jamais ignoré silencieusement (erreur explicite propagée, catégorie générique journalisée)", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('Keystore unavailable: raw native detail'));

    await expect(secureStorageAdapter.getItem(STORAGE_KEY)).rejects.toThrow('Impossible de lire la session sécurisée.');
    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy.mock.calls[0].join(' ')).toContain('lecture');
  });

  it('setItem : un échec SecureStore est propagé explicitement, jamais de repli silencieux vers AsyncStorage', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('Keystore full'));

    await expect(secureStorageAdapter.setItem(STORAGE_KEY, FAKE_SESSION_JSON)).rejects.toThrow(
      "Impossible d'enregistrer la session en sécurité.",
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('removeItem : un échec SecureStore est propagé explicitement', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error('Keystore error'));

    await expect(secureStorageAdapter.removeItem(STORAGE_KEY)).rejects.toThrow('Impossible de supprimer la session sécurisée.');
  });

  it('aucun appel console.log ne contient jamais la valeur (jeton) manipulée par setItem', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('fail'));

    await expect(secureStorageAdapter.setItem(STORAGE_KEY, FAKE_SESSION_JSON)).rejects.toThrow();

    const allLoggedText = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(allLoggedText).not.toContain(FAKE_ACCESS_TOKEN);
    expect(allLoggedText).not.toContain(FAKE_SESSION_JSON);
  });
});

describe('clearStoredSession', () => {
  it('supprime la clé via SecureStore sur natif', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

    await clearStoredSession(STORAGE_KEY);

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it('ne lève jamais, même si SecureStore échoue (best-effort)', async () => {
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error('fail'));

    await expect(clearStoredSession(STORAGE_KEY)).resolves.toBeUndefined();
  });

  it("n'appelle jamais SecureStore sur web (no-op)", async () => {
    Platform.OS = 'web';

    await clearStoredSession(STORAGE_KEY);

    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});

describe('migrateLegacySessionToSecureStore', () => {
  it("ne fait rien sur web : n'appelle ni AsyncStorage ni SecureStore", async () => {
    Platform.OS = 'web';

    await migrateLegacySessionToSecureStore(STORAGE_KEY);

    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('déjà migré (marqueur présent) : ne relit jamais AsyncStorage', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('true');

    await migrateLegacySessionToSecureStore(STORAGE_KEY);

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(`${STORAGE_KEY}-migrated-v1`);
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it("aucune ancienne valeur (nouvelle installation) : pose le marqueur, ne touche jamais SecureStore pour la session elle-même", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    await migrateLegacySessionToSecureStore(STORAGE_KEY);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(`${STORAGE_KEY}-migrated-v1`, 'true');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(STORAGE_KEY, expect.anything());
  });

  it('migre une ancienne session valide : écrit, relit pour confirmer, supprime AsyncStorage, pose le marqueur', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce(null) // vérification du marqueur : pas encore migré
      .mockResolvedValueOnce(FAKE_SESSION_JSON); // relecture de confirmation après écriture
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(FAKE_SESSION_JSON);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

    await migrateLegacySessionToSecureStore(STORAGE_KEY);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(STORAGE_KEY, FAKE_SESSION_JSON);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(`${STORAGE_KEY}-migrated-v1`, 'true');
  });

  it("ancienne valeur invalide (ne ressemble pas à une session) : nettoie AsyncStorage, pose le marqueur, mais n'écrit jamais cette valeur dans SecureStore", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('{"not":"a session"}');
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    await migrateLegacySessionToSecureStore(STORAGE_KEY);

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(STORAGE_KEY, expect.anything());
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(`${STORAGE_KEY}-migrated-v1`, 'true');
  });

  it("échec d'écriture SecureStore : conserve l'ancienne valeur AsyncStorage, ne pose jamais le marqueur", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(FAKE_SESSION_JSON);
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('write failed'));

    await migrateLegacySessionToSecureStore(STORAGE_KEY);

    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(`${STORAGE_KEY}-migrated-v1`, 'true');
  });

  it('incohérence à la relecture (readback mismatch) : conserve l\'ancienne valeur, ne pose jamais le marqueur', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce(null) // marqueur
      .mockResolvedValueOnce('{"corrupted":"during write"}'); // relecture différente de ce qui a été écrit
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(FAKE_SESSION_JSON);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    await migrateLegacySessionToSecureStore(STORAGE_KEY);

    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith(`${STORAGE_KEY}-migrated-v1`, 'true');
  });

  it('aucun jeton ne fuit jamais dans les logs pendant une migration réussie ou échouée', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(FAKE_SESSION_JSON);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(FAKE_SESSION_JSON);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

    await migrateLegacySessionToSecureStore(STORAGE_KEY);

    const allLoggedText = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(allLoggedText).not.toContain(FAKE_ACCESS_TOKEN);
  });
});
