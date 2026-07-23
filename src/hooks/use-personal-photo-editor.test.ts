import { act, renderHook } from '@testing-library/react-native';

import { usePersonalPhotoEditor } from '@/hooks/use-personal-photo-editor';
import { deletePersonalPhotoFile, savePersonalPhotoFile } from '@/lib/personal-photo-storage';
import { compressPersonalPhoto, pickPersonalPhotoFromLibrary } from '@/services/personal-photo';

jest.mock('@/lib/personal-photo-storage', () => ({
  savePersonalPhotoFile: jest.fn(),
  deletePersonalPhotoFile: jest.fn(),
}));

jest.mock('@/services/personal-photo', () => ({
  pickPersonalPhotoFromLibrary: jest.fn(),
  compressPersonalPhoto: jest.fn(),
}));

async function run(fn: () => unknown) {
  await act(async () => {
    await fn();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('usePersonalPhotoEditor — pick', () => {
  it('sélection annulée : previewUri reste null, aucune erreur', async () => {
    (pickPersonalPhotoFromLibrary as jest.Mock).mockResolvedValue(null);
    const { result } = await renderHook(() => usePersonalPhotoEditor());

    await run(() => result.current.pick());

    expect(result.current.previewUri).toBeNull();
    expect(result.current.error).toBeNull();
    expect(compressPersonalPhoto).not.toHaveBeenCalled();
  });

  it('image valide : compresse puis enregistre dans le stockage privé, expose previewUri', async () => {
    (pickPersonalPhotoFromLibrary as jest.Mock).mockResolvedValue({ uri: 'file:///cache/picked.jpg', width: 1080, height: 1920 });
    (compressPersonalPhoto as jest.Mock).mockResolvedValue({ uri: 'file:///cache/compressed.jpg', width: 720, height: 1280 });
    (savePersonalPhotoFile as jest.Mock).mockResolvedValue('file:///private/appearance-photos/abc.jpg');

    const { result } = await renderHook(() => usePersonalPhotoEditor());
    await run(() => result.current.pick());

    expect(compressPersonalPhoto).toHaveBeenCalledWith('file:///cache/picked.jpg');
    expect(savePersonalPhotoFile).toHaveBeenCalledWith('file:///cache/compressed.jpg');
    expect(result.current.previewUri).toBe('file:///private/appearance-photos/abc.jpg');
    expect(result.current.error).toBeNull();
  });

  it('propage un message d’erreur lisible si la sélection échoue (permission refusée, format invalide...)', async () => {
    (pickPersonalPhotoFromLibrary as jest.Mock).mockRejectedValue(new Error('Accès à tes photos refusé.'));
    const { result } = await renderHook(() => usePersonalPhotoEditor());

    await run(() => result.current.pick());

    expect(result.current.error).toBe('Accès à tes photos refusé.');
    expect(result.current.previewUri).toBeNull();
  });

  it('propage une erreur si la compression échoue, sans laisser previewUri en attente', async () => {
    (pickPersonalPhotoFromLibrary as jest.Mock).mockResolvedValue({ uri: 'file:///cache/picked.jpg', width: 10, height: 10 });
    (compressPersonalPhoto as jest.Mock).mockRejectedValue(new Error('échec compression'));

    const { result } = await renderHook(() => usePersonalPhotoEditor());
    await run(() => result.current.pick());

    expect(result.current.previewUri).toBeNull();
    expect(result.current.error).toBe('échec compression');
  });

  it("retombe sur un message générique si l'erreur n'est pas une instance d'Error", async () => {
    (pickPersonalPhotoFromLibrary as jest.Mock).mockResolvedValue({ uri: 'file:///cache/picked.jpg', width: 10, height: 10 });
    (compressPersonalPhoto as jest.Mock).mockRejectedValue('panne native');

    const { result } = await renderHook(() => usePersonalPhotoEditor());
    await run(() => result.current.pick());

    expect(result.current.error).toBe('Impossible de préparer cette photo pour le moment.');
  });
});

describe('usePersonalPhotoEditor — cancel / clearAfterConfirm', () => {
  async function pickSuccessfully(result: { current: ReturnType<typeof usePersonalPhotoEditor> }) {
    (pickPersonalPhotoFromLibrary as jest.Mock).mockResolvedValue({ uri: 'file:///cache/picked.jpg', width: 10, height: 10 });
    (compressPersonalPhoto as jest.Mock).mockResolvedValue({ uri: 'file:///cache/compressed.jpg', width: 720, height: 1280 });
    (savePersonalPhotoFile as jest.Mock).mockResolvedValue('file:///private/appearance-photos/pending.jpg');
    await run(() => result.current.pick());
  }

  it('cancel supprime le fichier en attente et efface l’aperçu', async () => {
    (deletePersonalPhotoFile as jest.Mock).mockResolvedValue(undefined);
    const { result } = await renderHook(() => usePersonalPhotoEditor());
    await pickSuccessfully(result);

    await run(() => result.current.cancel());

    expect(deletePersonalPhotoFile).toHaveBeenCalledWith('file:///private/appearance-photos/pending.jpg');
    expect(result.current.previewUri).toBeNull();
  });

  it("clearAfterConfirm efface l'aperçu SANS jamais supprimer le fichier (déjà appliqué par l'écran appelant)", async () => {
    const { result } = await renderHook(() => usePersonalPhotoEditor());
    await pickSuccessfully(result);

    await run(() => result.current.clearAfterConfirm());

    expect(deletePersonalPhotoFile).not.toHaveBeenCalled();
    expect(result.current.previewUri).toBeNull();
  });
});
