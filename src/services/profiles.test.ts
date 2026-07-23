import { supabase } from '@/lib/supabase';
import { getMyProfile, searchProfiles, updateMyAvatarPreset, updateMyProfile } from '@/services/profiles';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    storage: { from: jest.fn() },
    from: jest.fn(),
  },
}));

const mockRpc = supabase.rpc as jest.Mock;
const mockStorageFrom = supabase.storage.from as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

beforeEach(() => {
  mockStorageFrom.mockReturnValue({
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/avatars/${path}` } }),
  });
});

describe('searchProfiles', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('rejette une recherche trop courte sans appeler la RPC', async () => {
    await expect(searchProfiles('a')).rejects.toThrow('au moins 2 caractères');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('retourne les profils mappés pour une recherche valide', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: '1', username: 'bob', display_name: 'Bob', avatar_url: null, avatar_preset: 'wolf_grey' }],
      error: null,
    });

    const result = await searchProfiles('bob');

    expect(mockRpc).toHaveBeenCalledWith('search_public_profiles', { search_query: 'bob' });
    expect(result).toEqual([
      { id: '1', username: 'bob', displayName: 'Bob', avatarUrl: null, avatarPreset: 'wolf_grey' },
    ]);
  });

  it('retombe sur wolf_white_calm si avatar_preset renvoyé est hors liste officielle (défense en profondeur)', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: '1', username: 'bob', display_name: 'Bob', avatar_url: null, avatar_preset: 'inconnu' }],
      error: null,
    });

    const result = await searchProfiles('bob');

    expect(result[0].avatarPreset).toBe('wolf_white_calm');
  });

  it("ne laisse jamais fuir un message technique brut (pas de SQLSTATE P0001) : message français générique à la place", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network error' } });

    await expect(searchProfiles('bob')).rejects.toThrow('Impossible de rechercher des utilisateurs pour le moment.');
  });

  it("remonte le message d'une exception volontaire de la RPC (SQLSTATE P0001)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Requête invalide.' } });

    await expect(searchProfiles('bob')).rejects.toThrow('Requête invalide.');
  });

  it('convertit un avatar_url non nul (chemin Storage) en URL publique prête à afficher', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: '1', username: 'bob', display_name: 'Bob', avatar_url: '1/abc.jpg' }],
      error: null,
    });

    const result = await searchProfiles('bob');

    expect(mockStorageFrom).toHaveBeenCalledWith('avatars');
    expect(result[0].avatarUrl).toBe('https://cdn.test/avatars/1/abc.jpg');
  });
});

describe('getMyProfile', () => {
  const maybeSingle = jest.fn();

  beforeEach(() => {
    maybeSingle.mockReset();
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({ maybeSingle }),
    });
  });

  it('retourne le profil connecté avec avatarPath, avatarPreset et role en plus de avatarUrl', async () => {
    const select = jest.fn().mockReturnValue({ maybeSingle });
    mockFrom.mockReturnValue({ select });
    maybeSingle.mockResolvedValue({
      data: {
        id: 'me',
        username: 'kenjiro47',
        display_name: 'Kenjiro',
        avatar_url: 'me/abc.jpg',
        avatar_preset: 'wolf_alpha',
        role: 'user',
      },
      error: null,
    });

    const result = await getMyProfile();

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('id, username, display_name, avatar_url, avatar_preset, role');
    expect(result).toEqual({
      id: 'me',
      username: 'kenjiro47',
      displayName: 'Kenjiro',
      avatarUrl: 'https://cdn.test/avatars/me/abc.jpg',
      avatarPath: 'me/abc.jpg',
      avatarPreset: 'wolf_alpha',
      role: 'user',
    });
  });

  it('retourne role: owner quand le profil connecté est le owner', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: 'me',
        username: 'kenjiro47',
        display_name: 'Kenjiro',
        avatar_url: null,
        avatar_preset: 'wolf_white_calm',
        role: 'owner',
      },
      error: null,
    });

    const result = await getMyProfile();

    expect(result.role).toBe('owner');
  });

  it("n'expose jamais d'email : seules id/username/display_name/avatar_url/avatar_preset/role sont lues", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: 'me',
        username: 'kenjiro47',
        display_name: 'Kenjiro',
        avatar_url: null,
        avatar_preset: 'wolf_white_calm',
        role: 'user',
      },
      error: null,
    });

    const result = await getMyProfile();

    expect(result).not.toHaveProperty('email');
  });

  it('lève une erreur française si la requête échoue', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'network error' } });

    await expect(getMyProfile()).rejects.toThrow('Impossible de charger le profil pour le moment.');
  });

  it('lève une erreur française si aucun profil (data null)', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(getMyProfile()).rejects.toThrow('Profil introuvable.');
  });
});

describe('updateMyProfile', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('rejette un nom trop court sans appeler la RPC', async () => {
    await expect(updateMyProfile({ username: 'ab', displayName: 'Bob' })).rejects.toThrow(
      "Le nom d'utilisateur doit contenir entre 3 et 30 caractères.",
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('rejette un nom affiché trop court sans appeler la RPC', async () => {
    await expect(updateMyProfile({ username: 'kenjiro47', displayName: 'K' })).rejects.toThrow(
      'Le nom affiché doit contenir entre 2 et 50 caractères.',
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('normalise le nom d’utilisateur en minuscules avant de le passer à la RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'me', username: 'kenjiro47', display_name: 'Kenjiro', avatar_url: null }],
      error: null,
    });

    await updateMyProfile({ username: 'Kenjiro47', displayName: 'Kenjiro' });

    expect(mockRpc).toHaveBeenCalledWith('update_my_profile', {
      p_username: 'kenjiro47',
      p_display_name: 'Kenjiro',
      p_avatar_path: null,
    });
  });

  it('transmet le chemin avatar fourni, ou null par défaut', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'me', username: 'kenjiro47', display_name: 'Kenjiro', avatar_url: 'me/new.jpg' }],
      error: null,
    });

    await updateMyProfile({ username: 'kenjiro47', displayName: 'Kenjiro', avatarPath: 'me/new.jpg' });

    expect(mockRpc).toHaveBeenCalledWith('update_my_profile', {
      p_username: 'kenjiro47',
      p_display_name: 'Kenjiro',
      p_avatar_path: 'me/new.jpg',
    });
  });

  it('retourne le profil mis à jour, mappé avec avatarPath', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'me', username: 'kenjiro47', display_name: 'Kenjiro', avatar_url: 'me/new.jpg' }],
      error: null,
    });

    const result = await updateMyProfile({ username: 'kenjiro47', displayName: 'Kenjiro', avatarPath: 'me/new.jpg' });

    expect(result).toEqual({
      id: 'me',
      username: 'kenjiro47',
      displayName: 'Kenjiro',
      avatarUrl: 'https://cdn.test/avatars/me/new.jpg',
      avatarPath: 'me/new.jpg',
    });
  });

  it('ne renvoie jamais de champ role (jamais modifiable via update_my_profile, voir migration Phase 5.S3)', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'me', username: 'kenjiro47', display_name: 'Kenjiro', avatar_url: null }],
      error: null,
    });

    const result = await updateMyProfile({ username: 'kenjiro47', displayName: 'Kenjiro' });

    expect(result).not.toHaveProperty('role');
    expect(mockRpc).toHaveBeenCalledWith('update_my_profile', expect.not.objectContaining({ role: expect.anything(), p_role: expect.anything() }));
  });

  it("remonte le message français d'un nom d'utilisateur déjà pris (SQLSTATE P0001)", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: "Ce nom d'utilisateur est déjà utilisé." },
    });

    await expect(updateMyProfile({ username: 'kenjiro47', displayName: 'Kenjiro' })).rejects.toThrow(
      "Ce nom d'utilisateur est déjà utilisé.",
    );
  });

  it("ne laisse jamais fuir un message technique brut (pas de SQLSTATE P0001) : message français générique à la place", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network error' } });

    await expect(updateMyProfile({ username: 'kenjiro47', displayName: 'Kenjiro' })).rejects.toThrow(
      'Impossible de mettre à jour le profil pour le moment.',
    );
  });
});

describe('updateMyAvatarPreset', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('transmet le préréglage choisi à la RPC', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'me', avatar_preset: 'wolf_grey', avatar_url: null, previous_avatar_path: null }],
      error: null,
    });

    await updateMyAvatarPreset('wolf_grey');

    expect(mockRpc).toHaveBeenCalledWith('update_my_avatar_preset', { p_avatar_preset: 'wolf_grey' });
  });

  it('retourne le préréglage confirmé et previousAvatarPath=null quand aucune photo personnelle n’existait', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'me', avatar_preset: 'wolf_grey', avatar_url: null, previous_avatar_path: null }],
      error: null,
    });

    const result = await updateMyAvatarPreset('wolf_grey');

    expect(result).toEqual({ avatarPreset: 'wolf_grey', previousAvatarPath: null });
  });

  it('retourne previousAvatarPath quand une photo personnelle a été remplacée (à nettoyer côté client)', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'me', avatar_preset: 'wolf_grey', avatar_url: null, previous_avatar_path: 'me/old-photo.jpg' }],
      error: null,
    });

    const result = await updateMyAvatarPreset('wolf_grey');

    expect(result).toEqual({ avatarPreset: 'wolf_grey', previousAvatarPath: 'me/old-photo.jpg' });
  });

  it("lève une erreur française si la RPC échoue", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network error' } });

    await expect(updateMyAvatarPreset('wolf_grey')).rejects.toThrow(
      "Impossible de mettre à jour l'avatar pour le moment.",
    );
  });

  it('lève une erreur si la RPC renvoie un avatar_preset hors catalogue (défense en profondeur)', async () => {
    mockRpc.mockResolvedValue({
      data: [{ id: 'me', avatar_preset: 'inconnu', avatar_url: null, previous_avatar_path: null }],
      error: null,
    });

    await expect(updateMyAvatarPreset('wolf_grey')).rejects.toThrow(
      "Impossible de mettre à jour l'avatar pour le moment.",
    );
  });
});
