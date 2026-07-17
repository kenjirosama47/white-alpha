import { render, screen } from '@testing-library/react-native';

import { AvatarImage } from '@/components/avatar-image';
import { resolveWolfAvatarSource } from '@/constants/avatars';

// resolveWolfAvatarSource mocké : isole ce test de l'état réel de
// WOLF_AVATAR_SOURCES (qui évolue à mesure que des images définitives sont
// ajoutées, Phase 7.5) — ce fichier porte sur le COMPORTEMENT de repli
// d'AvatarImage, jamais sur le contenu actuel du catalogue d'assets.
jest.mock('@/constants/avatars', () => {
  const actual = jest.requireActual('@/constants/avatars');
  return { ...actual, resolveWolfAvatarSource: jest.fn() };
});

const mockResolveSource = resolveWolfAvatarSource as jest.Mock;

beforeEach(() => {
  mockResolveSource.mockReset();
});

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

  it("wolfPreset seul, source non résolue : retombe sur l'initiale sans erreur", async () => {
    mockResolveSource.mockReturnValue(null);
    await render(<AvatarImage avatarUrl={null} displayName="Kenjiro" wolfPreset="wolf_white_calm" />);

    expect(screen.getByText('K')).toBeTruthy();
  });

  it('wolfPreset seul, source résolue : affiche l’image loup, jamais l’initiale', async () => {
    mockResolveSource.mockReturnValue(42);
    await render(<AvatarImage avatarUrl={null} displayName="Kenjiro" wolfPreset="wolf_white_calm" />);

    expect(screen.getByLabelText('Avatar loup de Kenjiro')).toBeTruthy();
    expect(screen.queryByText('K')).toBeNull();
  });

  it('avatarUrl reste prioritaire sur wolfPreset quand les deux sont fournis', async () => {
    mockResolveSource.mockReturnValue(42);
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
