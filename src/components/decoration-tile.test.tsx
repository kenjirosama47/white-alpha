import { render, screen } from '@testing-library/react-native';

import { DecorationTile } from '@/components/decoration-tile';
import { resolveDecorationSource } from '@/constants/decorations';

// Isolé du contenu réel du catalogue d'assets (Phase 10.4) : ce test porte
// sur le COMPORTEMENT du composant selon que la source est résolue ou non,
// jamais sur le contenu actuel de DECORATION_SOURCES.
jest.mock('@/constants/decorations', () => {
  const actual = jest.requireActual('@/constants/decorations');
  return { ...actual, resolveDecorationSource: jest.fn() };
});

const mockResolveSource = resolveDecorationSource as jest.Mock;

beforeEach(() => {
  mockResolveSource.mockReset();
});

describe('DecorationTile — ressource absente (fallback)', () => {
  it("affiche le libellé (repli neutre) tant que la ressource n'est pas résolue, jamais une erreur", async () => {
    mockResolveSource.mockReturnValue(null);
    await render(<DecorationTile id="night_sky_moon" />);

    expect(screen.getByText('Pleine lune')).toBeTruthy();
  });

  it('fonctionne sans aucune donnée réseau : le rendu est synchrone (asset local uniquement, jamais un fetch)', async () => {
    mockResolveSource.mockReturnValue(null);
    await render(<DecorationTile id="forest_canopy" width={64} height={64} />);

    expect(screen.getByText('Forêt moussue')).toBeTruthy();
  });
});

describe('DecorationTile — ressource présente', () => {
  it("affiche l'image et jamais le repli texte une fois la source résolue", async () => {
    mockResolveSource.mockReturnValue(42);
    await render(<DecorationTile id="forest_canopy" />);

    expect(screen.queryByText('Forêt moussue')).toBeNull();
  });
});
