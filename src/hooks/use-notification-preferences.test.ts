import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useNotificationPreferences } from '@/hooks/use-notification-preferences';
import { getMyNotificationPreferences, updateMyNotificationPreferences } from '@/services/notification-preferences';
import type { NotificationPreferences } from '@/services/notification-preferences';

jest.mock('@/services/notification-preferences', () => ({
  getMyNotificationPreferences: jest.fn(),
  updateMyNotificationPreferences: jest.fn(),
}));

const defaults: NotificationPreferences = {
  notificationsEnabled: true,
  lockScreenPreview: false,
  soundEnabled: true,
};

describe('useNotificationPreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('premier chargement : les préférences apparaissent après isLoading', async () => {
    (getMyNotificationPreferences as jest.Mock).mockResolvedValue(defaults);

    const { result } = await renderHook(() => useNotificationPreferences());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.preferences).toEqual(defaults);
    expect(result.current.error).toBeNull();
  });

  it('update applique le changement de façon optimiste puis confirme avec la valeur serveur', async () => {
    (getMyNotificationPreferences as jest.Mock).mockResolvedValue(defaults);
    (updateMyNotificationPreferences as jest.Mock).mockResolvedValue({
      notificationsEnabled: false,
      lockScreenPreview: false,
      soundEnabled: true,
    });

    const { result } = await renderHook(() => useNotificationPreferences());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.update({ ...defaults, notificationsEnabled: false });
    });

    expect(ok).toBe(true);
    expect(result.current.preferences?.notificationsEnabled).toBe(false);
  });

  it("revient à la valeur précédente si la mise à jour échoue côté serveur (jamais d'état local incohérent)", async () => {
    (getMyNotificationPreferences as jest.Mock).mockResolvedValue(defaults);
    (updateMyNotificationPreferences as jest.Mock).mockRejectedValue(new Error('Impossible de mettre à jour.'));

    const { result } = await renderHook(() => useNotificationPreferences());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok = true;
    await act(async () => {
      ok = await result.current.update({ ...defaults, notificationsEnabled: false });
    });

    expect(ok).toBe(false);
    expect(result.current.preferences).toEqual(defaults);
    expect(result.current.error).toBe('Impossible de mettre à jour.');
  });
});
