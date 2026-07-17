import { supabase } from '@/lib/supabase';
import { getMyNotificationPreferences, updateMyNotificationPreferences } from '@/services/notification-preferences';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

const mockRpc = supabase.rpc as jest.Mock;

beforeEach(() => {
  mockRpc.mockReset();
});

describe('getMyNotificationPreferences', () => {
  it('mappe la ligne retournée par get_my_notification_preferences', async () => {
    mockRpc.mockResolvedValue({
      data: [{ notifications_enabled: true, lock_screen_preview: false, sound_enabled: true }],
      error: null,
    });

    const result = await getMyNotificationPreferences();

    expect(mockRpc).toHaveBeenCalledWith('get_my_notification_preferences');
    expect(result).toEqual({ notificationsEnabled: true, lockScreenPreview: false, soundEnabled: true });
  });

  it("ne laisse jamais fuir un message technique brut (pas de SQLSTATE P0001) : message français générique à la place", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network error' } });

    await expect(getMyNotificationPreferences()).rejects.toThrow(
      'Impossible de charger les préférences de notification.',
    );
  });
});

describe('updateMyNotificationPreferences', () => {
  it('envoie les préférences au format attendu par la RPC et mappe le résultat', async () => {
    mockRpc.mockResolvedValue({
      data: [{ notifications_enabled: false, lock_screen_preview: true, sound_enabled: false }],
      error: null,
    });

    const result = await updateMyNotificationPreferences({
      notificationsEnabled: false,
      lockScreenPreview: true,
      soundEnabled: false,
    });

    expect(mockRpc).toHaveBeenCalledWith('update_my_notification_preferences', {
      p_notifications_enabled: false,
      p_lock_screen_preview: true,
      p_sound_enabled: false,
    });
    expect(result).toEqual({ notificationsEnabled: false, lockScreenPreview: true, soundEnabled: false });
  });

  it("remonte le message d'une exception volontaire de la RPC (SQLSTATE P0001)", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Authentification requise.' },
    });

    await expect(
      updateMyNotificationPreferences({ notificationsEnabled: true, lockScreenPreview: false, soundEnabled: true }),
    ).rejects.toThrow('Authentification requise.');
  });
});
