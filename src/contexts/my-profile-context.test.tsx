import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { MyProfileProvider, useMyProfileContext } from '@/contexts/my-profile-context';
import { getMyProfile, type MyProfile } from '@/services/profiles';

jest.mock('@/services/profiles', () => ({
  getMyProfile: jest.fn(),
}));

const baseProfile: MyProfile = {
  id: 'me',
  username: 'kenjiro47',
  displayName: 'Kenjiro',
  avatarUrl: null,
  avatarPath: null,
  avatarPreset: 'wolf_white_calm',
  role: 'user',
};

function ScreenA() {
  const { profile, setProfile } = useMyProfileContext();
  return (
    <>
      <Text testID="a-preset">{profile?.avatarPreset}</Text>
      <Text testID="a-save" onPress={() => setProfile({ ...baseProfile, avatarPreset: 'wolf_alpha' })}>
        save
      </Text>
    </>
  );
}

function ScreenB() {
  const { profile } = useMyProfileContext();
  return <Text testID="b-preset">{profile?.avatarPreset}</Text>;
}

describe('MyProfileProvider / useMyProfileContext', () => {
  beforeEach(() => {
    (getMyProfile as jest.Mock).mockResolvedValue(baseProfile);
  });

  it(
    "une mise à jour du profil sur un écran (setProfile) se reflète immédiatement sur un autre écran, " +
      'sans nouveau chargement ni redémarrage (Anomalie 1, build 16)',
    async () => {
      await act(async () => {
        render(
          <MyProfileProvider>
            <ScreenA />
            <ScreenB />
          </MyProfileProvider>,
        );
        await Promise.resolve();
      });

      expect(screen.getByTestId('a-preset').props.children).toBe('wolf_white_calm');
      expect(screen.getByTestId('b-preset').props.children).toBe('wolf_white_calm');

      await act(async () => {
        screen.getByTestId('a-save').props.onPress();
      });

      // Une seule instance de useMyProfile partagée : le setProfile déclenché
      // par ScreenA (ex. galerie d'avatars) met aussi à jour ScreenB (ex.
      // écran Profil) sans qu'il ait besoin d'être remonté ni de refetch.
      expect(screen.getByTestId('a-preset').props.children).toBe('wolf_alpha');
      expect(screen.getByTestId('b-preset').props.children).toBe('wolf_alpha');
    },
  );
});
