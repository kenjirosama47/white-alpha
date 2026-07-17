import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  deactivateCurrentDevicePushTokenAsync,
  ensureAndroidNotificationChannelAsync,
  registerForPushNotificationsAsync,
} from '@/lib/push-notifications';
import { supabase } from '@/lib/supabase';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  deleteNotificationChannelAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PUBLIC: 1, PRIVATE: 0 },
}));

jest.mock('expo-device', () => ({ deviceName: 'Pixel de test' }));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0', extra: { eas: { projectId: 'test-project-id' } } } },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

const FAKE_TOKEN = 'ExponentPushToken[abcdefghijklmnopqrstuvwx]';
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

describe('registerForPushNotificationsAsync', () => {
  it('ne fait rien sur web (aucun appel de permission, aucun appel réseau)', async () => {
    Platform.OS = 'web';

    await registerForPushNotificationsAsync();

    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("n'enregistre aucun token si la permission est refusée : la messagerie n'est jamais bloquée", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });

    await registerForPushNotificationsAsync();

    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("ne redemande pas la permission si l'utilisateur ne peut plus être sollicité (canAskAgain=false)", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: false });

    await registerForPushNotificationsAsync();

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('permission accordée : obtient le token et l\'enregistre côté serveur avec la plateforme et le nom d\'appareil', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: FAKE_TOKEN });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [{ id: 'device-1', enabled: true }], error: null });

    await registerForPushNotificationsAsync();

    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'test-project-id' });
    expect(supabase.rpc).toHaveBeenCalledWith('register_push_device', {
      p_expo_push_token: FAKE_TOKEN,
      p_platform: 'android',
      p_device_name: 'Pixel de test',
      p_app_version: '1.0.0',
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(expect.any(String), FAKE_TOKEN);
  });

  it("n'écrit jamais le token complet dans les logs (préfixe court uniquement)", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: FAKE_TOKEN });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [{ id: 'device-1', enabled: true }], error: null });

    await registerForPushNotificationsAsync();

    const allLoggedText = consoleLogSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(allLoggedText).not.toContain(FAKE_TOKEN);
  });

  it("un échec côté serveur n'interrompt jamais le flux (aucune exception, token non mémorisé)", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: FAKE_TOKEN });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'Erreur serveur' } });

    await expect(registerForPushNotificationsAsync()).resolves.toBeUndefined();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

describe('deactivateCurrentDevicePushTokenAsync', () => {
  it("n'appelle aucune RPC si aucun token n'a été mémorisé localement", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    await deactivateCurrentDevicePushTokenAsync();

    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("désactive uniquement le token mémorisé de cet appareil et oublie la valeur locale ensuite", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(FAKE_TOKEN);
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

    await deactivateCurrentDevicePushTokenAsync();

    expect(supabase.rpc).toHaveBeenCalledWith('deactivate_push_device', { p_expo_push_token: FAKE_TOKEN });
    expect(AsyncStorage.removeItem).toHaveBeenCalled();
  });

  it("un échec réseau pendant la désactivation n'empêche jamais la déconnexion (aucune exception propagée)", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(FAKE_TOKEN);
    (supabase.rpc as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    await expect(deactivateCurrentDevicePushTokenAsync()).resolves.toBeUndefined();
    expect(AsyncStorage.removeItem).toHaveBeenCalled();
  });
});

describe('ensureAndroidNotificationChannelAsync', () => {
  it("ne fait rien sur une plateforme autre qu'Android", async () => {
    Platform.OS = 'ios';

    await ensureAndroidNotificationChannelAsync(false);

    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('recrée le canal avec la visibilité écran verrouillé demandée (privée par défaut)', async () => {
    await ensureAndroidNotificationChannelAsync(false);

    expect(Notifications.deleteNotificationChannelAsync).toHaveBeenCalled();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'messages',
      expect.objectContaining({ lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE }),
    );
  });

  it('applique la visibilité publique quand la préférence est activée', async () => {
    await ensureAndroidNotificationChannelAsync(true);

    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'messages',
      expect.objectContaining({ lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC }),
    );
  });
});
