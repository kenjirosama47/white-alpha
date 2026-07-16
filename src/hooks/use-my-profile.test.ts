import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMyProfile } from '@/hooks/use-my-profile';
import { getMyProfile } from '@/services/profiles';
import type { MyProfile } from '@/services/profiles';

jest.mock('@/services/profiles', () => ({
  getMyProfile: jest.fn(),
}));

const profileA: MyProfile = {
  id: 'me',
  username: 'kenjiro47',
  displayName: 'Kenjiro',
  avatarUrl: null,
  avatarPath: null,
};

describe('useMyProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('premier chargement : isLoading true puis le profil apparaît', async () => {
    (getMyProfile as jest.Mock).mockResolvedValue(profileA);

    const { result } = await renderHook(() => useMyProfile());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.profile).toEqual(profileA);
    expect(result.current.error).toBeNull();
  });

  it('erreur au premier chargement : message français, avec possibilité de réessayer via refresh', async () => {
    (getMyProfile as jest.Mock).mockRejectedValueOnce(new Error('Impossible de charger le profil pour le moment.'));

    const { result } = await renderHook(() => useMyProfile());
    await waitFor(() => expect(result.current.error).toBe('Impossible de charger le profil pour le moment.'));

    (getMyProfile as jest.Mock).mockResolvedValueOnce(profileA);
    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.profile).toEqual(profileA));
    expect(result.current.error).toBeNull();
  });

  it('setProfile met à jour le profil localement sans re-fetch', async () => {
    (getMyProfile as jest.Mock).mockResolvedValue(profileA);
    const { result } = await renderHook(() => useMyProfile());
    await waitFor(() => expect(result.current.profile).toEqual(profileA));

    const updated: MyProfile = { ...profileA, displayName: 'Kenjiro modifié' };
    await act(async () => {
      result.current.setProfile(updated);
    });

    expect(result.current.profile).toEqual(updated);
    expect(getMyProfile).toHaveBeenCalledTimes(1);
  });
});
