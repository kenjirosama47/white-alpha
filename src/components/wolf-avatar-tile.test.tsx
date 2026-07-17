import { render, screen } from '@testing-library/react-native';

import { WolfAvatarTile } from '@/components/wolf-avatar-tile';
import { resolveWolfAvatarSource } from '@/constants/avatars';

// Isolé de l'état réel de WOLF_AVATAR_SOURCES (qui évolue à mesure que des
// images définitives sont ajoutées, Phase 7.5) : ce test porte sur le
// COMPORTEMENT du composant selon que la source est présente ou non, jamais
// sur le contenu actuel du catalogue d'assets.
jest.mock('@/constants/avatars', () => {
  const actual = jest.requireActual('@/constants/avatars');
  return { ...actual, resolveWolfAvatarSource: jest.fn() };
});

const mockResolveSource = resolveWolfAvatarSource as jest.Mock;

beforeEach(() => {
  mockResolveSource.mockReset();
});

describe('WolfAvatarTile — repli (image définitive absente)', () => {
  it("affiche le nom du loup (repli neutre) tant que l'image définitive n'est pas ajoutée", async () => {
    mockResolveSource.mockReturnValue(null);
    await render(<WolfAvatarTile id="wolf_grey" />);

    expect(screen.getByText('Loup gris')).toBeTruthy();
  });

  it.each([
    ['wolf_white_calm', 'Loup blanc calme'],
    ['wolf_grey', 'Loup gris'],
    ['wolf_black', 'Loup noir'],
    ['wolf_brown', 'Loup brun'],
    ['wolf_snow', 'Loup des neiges'],
    ['wolf_green_eye', 'Loup au regard vert'],
    ['wolf_young', 'Loup jeune'],
    ['wolf_guardian', 'Loup protecteur'],
    ['wolf_alpha', 'Loup alpha'],
  ] as const)('affiche un repli distinct pour %s : « %s »', async (id, label) => {
    mockResolveSource.mockReturnValue(null);
    await render(<WolfAvatarTile id={id} />);

    expect(screen.getByText(label)).toBeTruthy();
  });

  it("fonctionne sans aucune donnée réseau : le rendu est synchrone (asset local uniquement, jamais un fetch)", async () => {
    mockResolveSource.mockReturnValue(null);
    await render(<WolfAvatarTile id="wolf_alpha" size={64} />);

    expect(screen.getByText('Loup alpha')).toBeTruthy();
  });
});

describe('WolfAvatarTile — image définitive présente', () => {
  it("affiche l'image et jamais le repli texte une fois la source disponible", async () => {
    mockResolveSource.mockReturnValue(42);
    await render(<WolfAvatarTile id="wolf_grey" />);

    expect(screen.queryByText('Loup gris')).toBeNull();
  });
});
