import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';
import {
  generateAvatarPath,
  getAvatarPublicUrl,
  pickAvatarFromLibrary,
  removeAvatarFile,
  uploadAvatar,
  type PickedAvatar,
} from '@/services/avatars';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: jest.fn() } },
}));

const mockStorageFrom = supabase.storage.from as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('generateAvatarPath', () => {
  it('produit un chemin user_id/uuid.extension, jamais un chemin à deux segments', () => {
    const path = generateAvatarPath('user-1', 'image/png');
    expect(path).toMatch(/^user-1\/[0-9a-f-]{36}\.png$/);
  });

  it('génère un identifiant différent à chaque appel', () => {
    const a = generateAvatarPath('user-1', 'image/jpeg');
    const b = generateAvatarPath('user-1', 'image/jpeg');
    expect(a).not.toBe(b);
  });
});

describe('pickAvatarFromLibrary', () => {
  it('retourne null quand la sélection est annulée', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });

    const result = await pickAvatarFromLibrary();

    expect(result).toBeNull();
  });

  it('lève une erreur en français si la permission bibliothèque est refusée', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });

    await expect(pickAvatarFromLibrary()).rejects.toThrow('Accès à tes photos refusé');
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it("rejette un asset dont le type MIME n'est pas autorisé", async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///avatar.heic', mimeType: 'image/heic', fileSize: 1000 }],
    });

    await expect(pickAvatarFromLibrary()).rejects.toThrow('Format d’image non pris en charge');
  });

  it('sélectionne uniquement des images de la bibliothèque, jamais la caméra, avec recadrage carré', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });

    await pickAvatarFromLibrary();

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] }),
    );
  });

  it('retourne les informations de la photo sélectionnée pour un type autorisé', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///avatar.jpg', mimeType: 'image/jpeg', fileSize: 2048 }],
    });

    const result = await pickAvatarFromLibrary();

    expect(result).toEqual<PickedAvatar>({ uri: 'file:///avatar.jpg', mimeType: 'image/jpeg', sizeBytes: 2048 });
  });
});

describe('uploadAvatar', () => {
  const picked: PickedAvatar = { uri: 'file:///avatar.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 };

  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  it('rejette un fichier trop volumineux avant tout upload', async () => {
    const bigBuffer = new ArrayBuffer(5 * 1024 * 1024 + 1);
    (globalThis.fetch as jest.Mock).mockResolvedValue({ arrayBuffer: () => Promise.resolve(bigBuffer) });

    await expect(uploadAvatar('user-1', picked)).rejects.toThrow('5 Mo');
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it("remonte une erreur française si l'upload Storage échoue", async () => {
    const smallBuffer = new ArrayBuffer(1000);
    (globalThis.fetch as jest.Mock).mockResolvedValue({ arrayBuffer: () => Promise.resolve(smallBuffer) });
    const upload = jest.fn().mockResolvedValue({ error: { message: 'network error' } });
    mockStorageFrom.mockReturnValue({ upload });

    await expect(uploadAvatar('user-1', picked)).rejects.toThrow("Impossible d'envoyer la photo de profil");
  });

  it('upload vers le bucket avatars avec un chemin user_id/uuid.ext et le bon type MIME, jamais le chemin local', async () => {
    const smallBuffer = new ArrayBuffer(1000);
    (globalThis.fetch as jest.Mock).mockResolvedValue({ arrayBuffer: () => Promise.resolve(smallBuffer) });
    const upload = jest.fn().mockResolvedValue({ error: null });
    mockStorageFrom.mockReturnValue({ upload });

    const result = await uploadAvatar('user-1', picked);

    expect(mockStorageFrom).toHaveBeenCalledWith('avatars');
    const [storagePath, body, options] = upload.mock.calls[0];
    expect(storagePath).toMatch(/^user-1\/[0-9a-f-]{36}\.jpg$/);
    expect(storagePath).not.toContain('file:///avatar.jpg');
    expect(body).toBe(smallBuffer);
    expect(options).toEqual({ contentType: 'image/jpeg', upsert: false });
    expect(result).toEqual({ storagePath });
  });
});

describe('getAvatarPublicUrl', () => {
  it('construit une URL publique via le bucket avatars, sans appel réseau', () => {
    const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.test/avatars/user-1/abc.jpg' } });
    mockStorageFrom.mockReturnValue({ getPublicUrl });

    const url = getAvatarPublicUrl('user-1/abc.jpg');

    expect(mockStorageFrom).toHaveBeenCalledWith('avatars');
    expect(getPublicUrl).toHaveBeenCalledWith('user-1/abc.jpg');
    expect(url).toBe('https://cdn.test/avatars/user-1/abc.jpg');
  });
});

describe('removeAvatarFile', () => {
  it('supprime le fichier Storage correspondant', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    mockStorageFrom.mockReturnValue({ remove });

    await removeAvatarFile('user-1/abc.jpg');

    expect(mockStorageFrom).toHaveBeenCalledWith('avatars');
    expect(remove).toHaveBeenCalledWith(['user-1/abc.jpg']);
  });

  it('échoue silencieusement (best-effort) si la suppression Storage échoue', async () => {
    const remove = jest.fn().mockRejectedValue(new Error('boom'));
    mockStorageFrom.mockReturnValue({ remove });

    await expect(removeAvatarFile('user-1/abc.jpg')).resolves.toBeUndefined();
  });
});
