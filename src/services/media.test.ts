import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';
import {
  generateStoragePath,
  getSignedAttachmentUrl,
  pickImageFromLibrary,
  removeAttachmentFile,
  uploadAttachment,
  type PickedImage,
} from '@/services/media';

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

describe('generateStoragePath', () => {
  it('produit un chemin conversation_id/uploader_id/uuid.extension, jamais le nom original', () => {
    const path = generateStoragePath('conv-1', 'user-1', 'image/png');
    expect(path).toMatch(/^conv-1\/user-1\/[0-9a-f-]{36}\.png$/);
  });

  it("génère un nom différent à chaque appel (pas de réutilisation)", () => {
    const a = generateStoragePath('conv-1', 'user-1', 'image/jpeg');
    const b = generateStoragePath('conv-1', 'user-1', 'image/jpeg');
    expect(a).not.toBe(b);
  });
});

describe('pickImageFromLibrary', () => {
  it('retourne null quand la sélection est annulée', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });

    const result = await pickImageFromLibrary();

    expect(result).toBeNull();
  });

  it('lève une erreur en français si la permission bibliothèque est refusée', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });

    await expect(pickImageFromLibrary()).rejects.toThrow('Accès à tes photos refusé');
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it("rejette un asset dont le type MIME n'est pas autorisé", async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///photo.heic', mimeType: 'image/heic', fileSize: 1000, width: 100, height: 100 }],
    });

    await expect(pickImageFromLibrary()).rejects.toThrow('Format d’image non pris en charge');
  });

  it('retourne les informations de l’image sélectionnée pour un type autorisé', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///photo.jpg', mimeType: 'image/jpeg', fileSize: 2048, width: 800, height: 600 }],
    });

    const result = await pickImageFromLibrary();

    expect(result).toEqual<PickedImage>({
      uri: 'file:///photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      width: 800,
      height: 600,
    });
  });

  it('ne demande que la permission bibliothèque (jamais caméra ni micro) et sélectionne uniquement des images', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });

    await pickImageFromLibrary();

    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'], allowsEditing: false }),
    );
  });
});

describe('uploadAttachment', () => {
  const picked: PickedImage = { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1000, width: 10, height: 10 };

  beforeEach(() => {
    globalThis.fetch = jest.fn();
  });

  it('rejette un fichier trop volumineux avant tout upload', async () => {
    const bigBuffer = new ArrayBuffer(10 * 1024 * 1024 + 1);
    (globalThis.fetch as jest.Mock).mockResolvedValue({ arrayBuffer: () => Promise.resolve(bigBuffer) });

    await expect(uploadAttachment('conv-1', 'user-1', picked)).rejects.toThrow('10 Mo');
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it("remonte une erreur française si l'upload Storage échoue", async () => {
    const smallBuffer = new ArrayBuffer(1000);
    (globalThis.fetch as jest.Mock).mockResolvedValue({ arrayBuffer: () => Promise.resolve(smallBuffer) });
    const upload = jest.fn().mockResolvedValue({ error: { message: 'network error' } });
    mockStorageFrom.mockReturnValue({ upload });

    await expect(uploadAttachment('conv-1', 'user-1', picked)).rejects.toThrow("Impossible d'envoyer l'image");
  });

  it('upload avec un chemin conversation_id/uploader_id/uuid.ext et le bon type MIME, jamais le chemin local', async () => {
    const smallBuffer = new ArrayBuffer(1000);
    (globalThis.fetch as jest.Mock).mockResolvedValue({ arrayBuffer: () => Promise.resolve(smallBuffer) });
    const upload = jest.fn().mockResolvedValue({ error: null });
    mockStorageFrom.mockReturnValue({ upload });

    const result = await uploadAttachment('conv-1', 'user-1', picked);

    expect(mockStorageFrom).toHaveBeenCalledWith('chat-media');
    const [storagePath, body, options] = upload.mock.calls[0];
    expect(storagePath).toMatch(/^conv-1\/user-1\/[0-9a-f-]{36}\.jpg$/);
    expect(storagePath).not.toContain('file:///photo.jpg');
    expect(body).toBe(smallBuffer);
    expect(options).toEqual({ contentType: 'image/jpeg', upsert: false });
    expect(result).toEqual({ storagePath, sizeBytes: 1000 });
  });
});

describe('removeAttachmentFile', () => {
  it('supprime le fichier Storage correspondant', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    mockStorageFrom.mockReturnValue({ remove });

    await removeAttachmentFile('conv-1/user-1/abc.jpg');

    expect(mockStorageFrom).toHaveBeenCalledWith('chat-media');
    expect(remove).toHaveBeenCalledWith(['conv-1/user-1/abc.jpg']);
  });

  it('échoue silencieusement (best-effort) si la suppression Storage échoue', async () => {
    const remove = jest.fn().mockRejectedValue(new Error('boom'));
    mockStorageFrom.mockReturnValue({ remove });

    await expect(removeAttachmentFile('conv-1/user-1/abc.jpg')).resolves.toBeUndefined();
  });
});

describe('getSignedAttachmentUrl', () => {
  it('retourne une URL signée sans jamais rien persister', async () => {
    const createSignedUrl = jest.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.example/x' }, error: null });
    mockStorageFrom.mockReturnValue({ createSignedUrl });

    const url = await getSignedAttachmentUrl('conv-1/user-1/abc.jpg');

    expect(url).toBe('https://signed.example/x');
    expect(createSignedUrl).toHaveBeenCalledWith('conv-1/user-1/abc.jpg', 3600);
  });

  it('lève une erreur française si la génération échoue', async () => {
    const createSignedUrl = jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    mockStorageFrom.mockReturnValue({ createSignedUrl });

    await expect(getSignedAttachmentUrl('conv-1/user-1/abc.jpg')).rejects.toThrow("Impossible de charger l'image");
  });
});
