import { resolveDecorationSource } from '@/constants/decorations';
import { personalPhotoFileExists } from '@/lib/personal-photo-storage';
import { resolveBackgroundSource } from '@/lib/resolve-background-source';
import type { BackgroundConfig } from '@/types/appearance';

jest.mock('@/constants/decorations', () => ({
  resolveDecorationSource: jest.fn(),
}));

jest.mock('@/lib/personal-photo-storage', () => ({
  personalPhotoFileExists: jest.fn(),
}));

const mockResolveDecorationSource = resolveDecorationSource as jest.Mock;
const mockPersonalPhotoFileExists = personalPhotoFileExists as jest.Mock;

beforeEach(() => {
  mockResolveDecorationSource.mockReset();
  mockPersonalPhotoFileExists.mockReset();
});

// Correctif intégration des fonds d'écran : point unique de résolution,
// partagé par l'aperçu de l'écran Apparence et par les écrans réels
// (Accueil/Conversation/Profil, voir components/appearance-background.tsx).
describe('resolveBackgroundSource', () => {
  it("renvoie null pour un fond 'default' (fond par défaut)", () => {
    const background: BackgroundConfig = { kind: 'default' };

    expect(resolveBackgroundSource(background)).toBeNull();
    expect(mockResolveDecorationSource).not.toHaveBeenCalled();
    expect(mockPersonalPhotoFileExists).not.toHaveBeenCalled();
  });

  it("renvoie la source résolue par le catalogue pour un fond 'catalog'", () => {
    mockResolveDecorationSource.mockReturnValue(42);
    const background: BackgroundConfig = { kind: 'catalog', decorationId: 'wolves_gaze' };

    expect(resolveBackgroundSource(background)).toBe(42);
    expect(mockResolveDecorationSource).toHaveBeenCalledWith('wolves_gaze');
  });

  it("renvoie { uri } pour une photo personnelle dont le fichier existe encore", () => {
    mockPersonalPhotoFileExists.mockReturnValue(true);
    const background: BackgroundConfig = { kind: 'personal', localUri: 'file:///mock/private/appearance-photos/a.jpg' };

    expect(resolveBackgroundSource(background)).toEqual({ uri: 'file:///mock/private/appearance-photos/a.jpg' });
  });

  it("renvoie null (repli fond par défaut) pour une photo personnelle dont le fichier n'existe plus", () => {
    mockPersonalPhotoFileExists.mockReturnValue(false);
    const background: BackgroundConfig = { kind: 'personal', localUri: 'file:///mock/private/appearance-photos/gone.jpg' };

    expect(resolveBackgroundSource(background)).toBeNull();
  });

  it('priorité photo personnelle > catalogue : un fond personal ignore totalement le résolveur de catalogue', () => {
    mockPersonalPhotoFileExists.mockReturnValue(true);
    const background: BackgroundConfig = { kind: 'personal', localUri: 'file:///mock/private/appearance-photos/b.jpg' };

    resolveBackgroundSource(background);

    expect(mockResolveDecorationSource).not.toHaveBeenCalled();
  });
});
