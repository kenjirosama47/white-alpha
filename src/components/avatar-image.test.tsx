import { render, screen } from '@testing-library/react-native';

import { AvatarImage } from '@/components/avatar-image';

describe('AvatarImage', () => {
  it("affiche l'initiale du nom quand aucun avatarUrl ni wolfPreset n'est disponible", async () => {
    await render(<AvatarImage avatarUrl={null} displayName="Kenjiro" />);

    expect(screen.getByText('K')).toBeTruthy();
  });

  it("affiche l'image quand avatarUrl est défini", async () => {
    await render(<AvatarImage avatarUrl="https://cdn.test/avatars/u1.jpg" displayName="Kenjiro" />);

    expect(screen.getByLabelText('Photo de profil de Kenjiro')).toBeTruthy();
    expect(screen.queryByText('K')).toBeNull();
  });

  it("wolfPreset seul (aucune image définitive encore fournie, Phase 7.1) : retombe sur l'initiale sans erreur", async () => {
    await render(<AvatarImage avatarUrl={null} displayName="Kenjiro" wolfPreset="wolf_white_calm" />);

    expect(screen.getByText('K')).toBeTruthy();
  });

  it('avatarUrl reste prioritaire sur wolfPreset quand les deux sont fournis', async () => {
    await render(
      <AvatarImage avatarUrl="https://cdn.test/avatars/u1.jpg" displayName="Kenjiro" wolfPreset="wolf_alpha" />,
    );

    expect(screen.getByLabelText('Photo de profil de Kenjiro')).toBeTruthy();
  });

  it('highlighted=true ne lève pas d\'erreur de rendu', async () => {
    await render(<AvatarImage avatarUrl={null} displayName="Kenjiro" highlighted />);

    expect(screen.getByText('K')).toBeTruthy();
  });
});
