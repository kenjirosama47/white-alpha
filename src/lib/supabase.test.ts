/* eslint-disable @typescript-eslint/no-require-imports -- jest.resetModules()
   nécessite un require() synchrone pour ré-exécuter lib/supabase.ts avec un
   Platform.OS différent à chaque test ; import() dynamique n'est pas
   supporté par cette configuration Jest (pas de --experimental-vm-modules). */
import { Platform } from 'react-native';

const mockCreateClient = jest.fn().mockReturnValue({ auth: {} });

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const mockSecureStorageAdapter = { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() };
jest.mock('@/lib/secure-session-storage', () => ({
  secureStorageAdapter: mockSecureStorageAdapter,
}));

const originalPlatformOS = Platform.OS;
const originalEnv = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  mockCreateClient.mockClear();
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://testproj.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
});

afterEach(() => {
  Platform.OS = originalPlatformOS;
  process.env = { ...originalEnv };
});

describe('lib/supabase client configuration', () => {
  it("sur natif (Android/iOS) : utilise l'adaptateur SecureStore, jamais AsyncStorage", async () => {
    Platform.OS = 'android';

    require('@/lib/supabase');

    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    const options = mockCreateClient.mock.calls[0][2];
    expect(options.auth.storage).toBe(mockSecureStorageAdapter);
  });

  it("sur web : storage est undefined (jamais SecureStore importé ni appelé, jamais cassé)", async () => {
    Platform.OS = 'web';

    require('@/lib/supabase');

    const options = mockCreateClient.mock.calls[0][2];
    expect(options.auth.storage).toBeUndefined();
  });

  it('storageKey est calculé explicitement à partir du hostname du projet', async () => {
    Platform.OS = 'android';

    const mod = require('@/lib/supabase');

    expect(mod.SESSION_STORAGE_KEY).toBe('sb-testproj-auth-token');
    const options = mockCreateClient.mock.calls[0][2];
    expect(options.auth.storageKey).toBe('sb-testproj-auth-token');
  });

  it("n'utilise aucune option lock/processLock (dépréciée et sans effet dans la version installée)", async () => {
    Platform.OS = 'android';

    require('@/lib/supabase');

    const options = mockCreateClient.mock.calls[0][2];
    expect(options.auth.lock).toBeUndefined();
  });

  it('persistSession et autoRefreshToken restent activés sur toutes les plateformes', async () => {
    Platform.OS = 'android';

    require('@/lib/supabase');

    const options = mockCreateClient.mock.calls[0][2];
    expect(options.auth.persistSession).toBe(true);
    expect(options.auth.autoRefreshToken).toBe(true);
  });
});
