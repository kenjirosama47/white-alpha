import { act, renderHook } from '@testing-library/react-native';

import { useProfileEditor } from '@/hooks/use-profile-editor';
import { pickAvatarFromLibrary, removeAvatarFile, uploadAvatar } from '@/services/avatars';
import { updateMyProfile, type MyProfile } from '@/services/profiles';

jest.mock('@/services/avatars', () => ({
  pickAvatarFromLibrary: jest.fn(),
  uploadAvatar: jest.fn(),
  removeAvatarFile: jest.fn(),
}));

jest.mock('@/services/profiles', () => ({
  updateMyProfile: jest.fn(),
}));

const baseProfile: MyProfile = {
  id: 'me',
  username: 'kenjiro47',
  displayName: 'Kenjiro',
  avatarUrl: 'https://cdn.test/avatars/me/old.jpg',
  avatarPath: 'me/old.jpg',
  avatarPreset: 'wolf_white_calm',
  role: 'user',
};

// Un act() synchrone ne garantit pas le hop d'effet interne à renderHook
// (result.current n'est réassigné que dans un useEffect du conteneur) : sans
// microtâche, result.current peut rester périmé. Voir use-network-status.test.tsx
// pour le même constat, déjà documenté dans ce projet.
async function run(fn: () => unknown) {
  await act(async () => {
    await fn();
    await Promise.resolve();
  });
}

describe('useProfileEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (removeAvatarFile as jest.Mock).mockResolvedValue(undefined);
  });

  it("n'est pas modifié (isDirty=false) tant que rien n'a changé", async () => {
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    expect(result.current.isDirty).toBe(false);
  });

  it('devient modifié après un changement de nom affiché', async () => {
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    await run(() => result.current.setDisplayName('Kenjiro modifié'));

    expect(result.current.isDirty).toBe(true);
  });

  it("n'est pas modifié si le nom d'utilisateur ne change que de casse (normalisation en minuscules)", async () => {
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    await run(() => result.current.setUsername('Kenjiro47'));

    expect(result.current.isDirty).toBe(false);
  });

  it("save() ne fait rien tant que rien n'est modifié", async () => {
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    let saved: boolean = true;
    await run(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe(false);
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it("rejette un nom d'utilisateur trop court avant d'appeler la RPC", async () => {
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    await run(() => result.current.setUsername('ab'));
    await run(() => result.current.save());

    expect(result.current.error).toBe("Le nom d'utilisateur doit contenir entre 3 et 30 caractères.");
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it("rejette un nom d'utilisateur au format invalide (commence par un underscore)", async () => {
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    await run(() => result.current.setUsername('_kenjiro'));
    await run(() => result.current.save());

    expect(result.current.error).toMatch(/commencer par une lettre ou un chiffre/);
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it('remonte le message français si le nom est déjà pris (renvoyé par la RPC)', async () => {
    (updateMyProfile as jest.Mock).mockRejectedValue(new Error("Ce nom d'utilisateur est déjà utilisé."));
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    await run(() => result.current.setUsername('dejapris'));
    await run(() => result.current.save());

    expect(result.current.error).toBe("Ce nom d'utilisateur est déjà utilisé.");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('enregistre un nom affiché modifié, montre le succès, et appelle onSaved', async () => {
    const updated: MyProfile = { ...baseProfile, displayName: 'Kenjiro modifié' };
    (updateMyProfile as jest.Mock).mockResolvedValue(updated);
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    await run(() => result.current.setDisplayName('Kenjiro modifié'));
    let saved: boolean = false;
    await run(async () => {
      saved = await result.current.save();
    });

    expect(saved).toBe(true);
    expect(updateMyProfile).toHaveBeenCalledWith({
      username: 'kenjiro47',
      displayName: 'Kenjiro modifié',
      avatarPath: undefined,
    });
    expect(result.current.success).toBe(true);
    expect(onSaved).toHaveBeenCalledWith(updated);
  });

  it('bloque le double-clic : un second save() pendant que le premier est en cours ne relance pas la RPC', async () => {
    let resolveUpdate: (value: MyProfile) => void = () => {};
    (updateMyProfile as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    await run(() => result.current.setDisplayName('Kenjiro modifié'));

    let firstCallPromise: Promise<boolean> = Promise.resolve(false);
    await run(async () => {
      firstCallPromise = result.current.save();
      const second = await result.current.save();
      expect(second).toBe(false);
    });

    expect(updateMyProfile).toHaveBeenCalledTimes(1);

    await run(async () => {
      resolveUpdate({ ...baseProfile, displayName: 'Kenjiro modifié' });
      await firstCallPromise;
    });
  });

  it('la sélection annulée ne change rien (pickedAvatar reste null, pas d’erreur)', async () => {
    (pickAvatarFromLibrary as jest.Mock).mockResolvedValue(null);
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    await run(() => result.current.pickAvatar());

    expect(result.current.pickedAvatar).toBeNull();
    expect(result.current.avatarError).toBeNull();
    expect(result.current.isDirty).toBe(false);
  });

  it('une erreur de sélection (permission refusée, MIME invalide) est affichée en français', async () => {
    (pickAvatarFromLibrary as jest.Mock).mockRejectedValue(new Error('Accès à tes photos refusé.'));
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    await run(() => result.current.pickAvatar());

    expect(result.current.avatarError).toBe('Accès à tes photos refusé.');
  });

  it('cancelAvatar annule la photo sélectionnée avant tout upload', async () => {
    (pickAvatarFromLibrary as jest.Mock).mockResolvedValue({
      uri: 'file:///new.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
    });
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    await run(() => result.current.pickAvatar());
    expect(result.current.pickedAvatar).not.toBeNull();

    await run(() => result.current.cancelAvatar());

    expect(result.current.pickedAvatar).toBeNull();
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it("save() avec une nouvelle photo : upload puis RPC puis suppression de l'ANCIEN avatar (jamais un autre compte)", async () => {
    (pickAvatarFromLibrary as jest.Mock).mockResolvedValue({
      uri: 'file:///new.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
    });
    (uploadAvatar as jest.Mock).mockResolvedValue({ storagePath: 'me/new.jpg' });
    const updated: MyProfile = { ...baseProfile, avatarUrl: 'https://cdn.test/avatars/me/new.jpg', avatarPath: 'me/new.jpg' };
    (updateMyProfile as jest.Mock).mockResolvedValue(updated);
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    await run(() => result.current.pickAvatar());
    await run(() => result.current.save());

    expect(uploadAvatar).toHaveBeenCalledWith('me', expect.objectContaining({ uri: 'file:///new.jpg' }));
    expect(updateMyProfile).toHaveBeenCalledWith({
      username: 'kenjiro47',
      displayName: 'Kenjiro',
      avatarPath: 'me/new.jpg',
    });
    // Seul l'ANCIEN chemin (celui du même utilisateur, avant remplacement) est supprimé après succès.
    expect(removeAvatarFile).toHaveBeenCalledTimes(1);
    expect(removeAvatarFile).toHaveBeenCalledWith('me/old.jpg');
    expect(result.current.pickedAvatar).toBeNull();
    expect(onSaved).toHaveBeenCalledWith(updated);
  });

  it('si la RPC échoue après un upload réussi, supprime le NOUVEAU fichier en compensation (jamais l’ancien)', async () => {
    (pickAvatarFromLibrary as jest.Mock).mockResolvedValue({
      uri: 'file:///new.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1000,
    });
    (uploadAvatar as jest.Mock).mockResolvedValue({ storagePath: 'me/new.jpg' });
    (updateMyProfile as jest.Mock).mockRejectedValue(new Error('Impossible de mettre à jour le profil pour le moment.'));
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    await run(() => result.current.pickAvatar());
    await run(() => result.current.save());

    expect(removeAvatarFile).toHaveBeenCalledTimes(1);
    expect(removeAvatarFile).toHaveBeenCalledWith('me/new.jpg');
    expect(removeAvatarFile).not.toHaveBeenCalledWith('me/old.jpg');
    expect(result.current.error).toBe('Impossible de mettre à jour le profil pour le moment.');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("n'appelle jamais removeAvatarFile si aucune nouvelle photo n'a été choisie", async () => {
    const updated: MyProfile = { ...baseProfile, displayName: 'Kenjiro modifié' };
    (updateMyProfile as jest.Mock).mockResolvedValue(updated);
    const onSaved = jest.fn();
    const { result } = await renderHook(() => useProfileEditor(baseProfile, onSaved));

    await run(() => result.current.setDisplayName('Kenjiro modifié'));
    await run(() => result.current.save());

    expect(removeAvatarFile).not.toHaveBeenCalled();
  });
});
