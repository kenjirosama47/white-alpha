import { fireEvent, render, screen } from '@testing-library/react-native';

import { ProfileSearchResult } from '@/components/profile-search-result';
import type { PublicProfile } from '@/types/chat';

const profile: PublicProfile = {
  id: 'u1',
  username: 'bob',
  displayName: 'Bob',
  avatarUrl: null,
  avatarPreset: 'wolf_grey',
};

describe('ProfileSearchResult', () => {
  it('affiche le nom affiché et le nom d’utilisateur', async () => {
    await render(<ProfileSearchResult profile={profile} onPress={jest.fn()} />);

    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('@bob')).toBeTruthy();
  });

  it(
    "affiche l'avatar loup du profil (avatarPreset) quand il n'a pas de photo personnelle " +
      '(Anomalie 1, build 16 — le résultat de recherche omettait wolfPreset)',
    async () => {
      await render(<ProfileSearchResult profile={profile} onPress={jest.fn()} />);

      expect(screen.getByLabelText('Avatar loup de Bob')).toBeTruthy();
    },
  );

  it('appelle onPress au toucher', async () => {
    const onPress = jest.fn();
    await render(<ProfileSearchResult profile={profile} onPress={onPress} />);

    fireEvent.press(screen.getByText('Bob'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
