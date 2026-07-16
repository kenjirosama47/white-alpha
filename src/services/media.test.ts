import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import * as tus from 'tus-js-client';

import { supabase } from '@/lib/supabase';
import {
  generateStoragePath,
  getSignedAttachmentUrl,
  pickImageFromLibrary,
  pickVideoFromLibrary,
  recoverPendingMediaPick,
  removeAttachmentFile,
  removeAttachmentFileOrThrow,
  uploadAttachment,
  uploadVideoResumable,
  VideoUploadCancelledError,
  type PickedImage,
  type PickedVideo,
} from '@/services/media';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  getPendingResultAsync: jest.fn(),
}));

jest.mock('tus-js-client', () => ({
  Upload: jest.fn(),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: jest.fn() }, auth: { getSession: jest.fn() } },
  SUPABASE_URL: 'https://testproj.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
}));

const mockStorageFrom = supabase.storage.from as jest.Mock;
const mockGetSession = supabase.auth.getSession as jest.Mock;
const originalPlatformOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'test-access-token' } }, error: null });
});

afterEach(() => {
  Platform.OS = originalPlatformOS;
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

describe('removeAttachmentFileOrThrow', () => {
  it('supprime le fichier Storage correspondant, exactement ce chemin', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    mockStorageFrom.mockReturnValue({ remove });

    await removeAttachmentFileOrThrow('conv-1/user-1/clip.mp4');

    expect(mockStorageFrom).toHaveBeenCalledWith('chat-media');
    expect(remove).toHaveBeenCalledWith(['conv-1/user-1/clip.mp4']);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('propage une erreur française si la suppression Storage échoue (contrairement à removeAttachmentFile)', async () => {
    const remove = jest.fn().mockResolvedValue({ error: { message: 'network down' } });
    mockStorageFrom.mockReturnValue({ remove });

    await expect(removeAttachmentFileOrThrow('conv-1/user-1/clip.mp4')).rejects.toThrow(
      'Impossible de supprimer le fichier pour le moment.',
    );
  });

  it('idempotente : un fichier déjà absent (déjà supprimé) ne lève pas d\'erreur (sémantique Storage/S3 standard : DELETE sur une clé absente réussit)', async () => {
    // Le Storage Supabase (compatible S3) ne renvoie pas d'erreur pour la
    // suppression d'un objet déjà absent : `data` reflète simplement 0 fichier
    // réellement supprimé, `error` reste null. La suppression du message en
    // base (RPC delete_own_message) doit donc pouvoir continuer normalement.
    const remove = jest.fn().mockResolvedValue({ data: [], error: null });
    mockStorageFrom.mockReturnValue({ remove });

    await expect(removeAttachmentFileOrThrow('conv-1/user-1/deja-absent.mp4')).resolves.toBeUndefined();
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

describe('pickVideoFromLibrary', () => {
  it('retourne null quand la sélection est annulée', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });

    await expect(pickVideoFromLibrary()).resolves.toBeNull();
  });

  it('lève une erreur en français si la permission bibliothèque est refusée', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });

    await expect(pickVideoFromLibrary()).rejects.toThrow('Accès à tes vidéos refusé');
    expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it("rejette un asset dont le type MIME n'est pas MP4", async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///clip.mov', mimeType: 'video/quicktime', fileSize: 1000, duration: 5000, width: 100, height: 100 }],
    });

    await expect(pickVideoFromLibrary()).rejects.toThrow('Format vidéo non pris en charge');
  });

  it('retourne les informations de la vidéo sélectionnée (natif : duration déjà en ms), sans jamais demander la caméra', async () => {
    Platform.OS = 'android';
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///clip.mp4', mimeType: 'video/mp4', fileSize: 2_000_000, duration: 15_000, width: 1280, height: 720 }],
    });

    const result = await pickVideoFromLibrary();

    expect(result).toEqual<PickedVideo>({
      uri: 'file:///clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 2_000_000,
      durationMs: 15_000,
      width: 1280,
      height: 720,
    });
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['videos'] }));
  });

  it("convertit la durée de secondes (web) en millisecondes entières (bug amont d'expo-image-picker.web.ts)", async () => {
    Platform.OS = 'web';
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      // Sur web, expo-image-picker rapporte HTMLVideoElement.duration (secondes, flottant).
      assets: [{ uri: 'file:///clip.mp4', mimeType: 'video/mp4', fileSize: 75_883, duration: 2.032467, width: 480, height: 360 }],
    });

    const result = await pickVideoFromLibrary();

    // Sans la correction, ceci resterait 2.032467 et ferait échouer create_video_message
    // avec une erreur Postgres brute ("invalid input syntax for type integer").
    expect(result?.durationMs).toBe(2032);
    expect(Number.isInteger(result?.durationMs)).toBe(true);
  });

  it('retourne durationMs null si la durée est absente ou non finie', async () => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///clip.mp4', mimeType: 'video/mp4', fileSize: 1000, duration: null, width: 100, height: 100 }],
    });

    const result = await pickVideoFromLibrary();

    expect(result?.durationMs).toBeNull();
  });
});

describe('recoverPendingMediaPick', () => {
  it("retourne null s'il n'y a rien à récupérer", async () => {
    (ImagePicker.getPendingResultAsync as jest.Mock).mockResolvedValue(null);
    await expect(recoverPendingMediaPick()).resolves.toBeNull();
  });

  it('retourne null pour un résultat annulé', async () => {
    (ImagePicker.getPendingResultAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    await expect(recoverPendingMediaPick()).resolves.toBeNull();
  });

  it('récupère une vidéo perdue (activité Android détruite pendant le sélecteur)', async () => {
    Platform.OS = 'android';
    (ImagePicker.getPendingResultAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        { type: 'video', uri: 'file:///clip.mp4', mimeType: 'video/mp4', fileSize: 500, duration: 3000, width: 640, height: 480 },
      ],
    });

    await expect(recoverPendingMediaPick()).resolves.toEqual({
      kind: 'video',
      data: { uri: 'file:///clip.mp4', mimeType: 'video/mp4', sizeBytes: 500, durationMs: 3000, width: 640, height: 480 },
    });
  });

  it('récupère une photo perdue (activité Android détruite pendant le sélecteur)', async () => {
    (ImagePicker.getPendingResultAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ type: 'image', uri: 'file:///photo.jpg', mimeType: 'image/jpeg', fileSize: 500, width: 100, height: 100 }],
    });

    await expect(recoverPendingMediaPick()).resolves.toEqual({
      kind: 'image',
      data: { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', sizeBytes: 500, width: 100, height: 100 },
    });
  });
});

describe('uploadVideoResumable', () => {
  const picked: PickedVideo = {
    uri: 'file:///clip.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 2_000_000,
    durationMs: 15_000,
    width: 1280,
    height: 720,
  };

  let mockUploadInstance: { start: jest.Mock; abort: jest.Mock };
  let capturedOptions: tus.UploadOptions | undefined;

  beforeEach(() => {
    mockUploadInstance = { start: jest.fn(), abort: jest.fn() };
    capturedOptions = undefined;
    (tus.Upload as unknown as jest.Mock).mockImplementation((_file: unknown, options: tus.UploadOptions) => {
      capturedOptions = options;
      return mockUploadInstance;
    });
  });

  it('rejette une vidéo trop volumineuse (taille réelle du blob) avant tout upload', async () => {
    const bigBlob = { size: 50 * 1024 * 1024 + 1 } as Blob;

    const handle = uploadVideoResumable('conv-1', 'user-1', picked, bigBlob);

    await expect(handle.promise).rejects.toThrow('50 Mo');
    expect(tus.Upload).not.toHaveBeenCalled();
  });

  it('rejette une vidéo trop longue avant tout upload', async () => {
    const blob = { size: 1000 } as Blob;
    const tooLong = { ...picked, durationMs: 60_001 };

    const handle = uploadVideoResumable('conv-1', 'user-1', tooLong, blob);

    await expect(handle.promise).rejects.toThrow('60 secondes');
    expect(tus.Upload).not.toHaveBeenCalled();
  });

  it('construit un upload TUS avec endpoint, en-têtes, métadonnées et paramètres de reprise corrects', async () => {
    const blob = { size: 2_000_000 } as Blob;

    const handle = uploadVideoResumable('conv-1', 'user-1', picked, blob);
    await waitForCapturedOptions(() => capturedOptions);

    expect(tus.Upload).toHaveBeenCalledWith(blob, expect.any(Object));
    expect(capturedOptions?.endpoint).toBe('https://testproj.storage.supabase.co/storage/v1/upload/resumable');
    expect(capturedOptions?.headers).toEqual({
      authorization: 'Bearer test-access-token',
      apikey: 'test-publishable-key',
      'x-upsert': 'false',
    });
    expect(capturedOptions?.metadata).toEqual(
      expect.objectContaining({ bucketName: 'chat-media', contentType: 'video/mp4' }),
    );
    expect(capturedOptions?.metadata?.objectName).toMatch(/^conv-1\/user-1\/[0-9a-f-]{36}\.mp4$/);
    expect(capturedOptions?.chunkSize).toBe(6 * 1024 * 1024);
    expect(capturedOptions?.retryDelays).toEqual([0, 3000, 5000, 10000, 20000]);
    expect(mockUploadInstance.start).toHaveBeenCalledTimes(1);

    capturedOptions?.onSuccess?.({ lastResponse: {} as tus.HttpResponse });
    await expect(handle.promise).resolves.toEqual({
      storagePath: expect.stringMatching(/^conv-1\/user-1\/[0-9a-f-]{36}\.mp4$/),
      sizeBytes: 2_000_000,
    });
  });

  it('suit la progression via onProgress', async () => {
    const blob = { size: 2_000_000 } as Blob;
    const onProgress = jest.fn();

    const handle = uploadVideoResumable('conv-1', 'user-1', picked, blob, onProgress);
    await waitForCapturedOptions(() => capturedOptions);

    capturedOptions?.onProgress?.(1_000_000, 2_000_000);
    expect(onProgress).toHaveBeenCalledWith(50);

    capturedOptions?.onSuccess?.({ lastResponse: {} as tus.HttpResponse });
    await handle.promise;
  });

  it("remonte une erreur française générique si l'upload échoue, sans exposer le jeton d'accès", async () => {
    const blob = { size: 2_000_000 } as Blob;

    const handle = uploadVideoResumable('conv-1', 'user-1', picked, blob);
    await waitForCapturedOptions(() => capturedOptions);

    capturedOptions?.onError?.(new Error('tus: unexpected response code 500, Authorization: Bearer test-access-token'));

    await expect(handle.promise).rejects.toThrow("Impossible d'envoyer la vidéo");
    try {
      await handle.promise;
    } catch (err) {
      expect(err instanceof Error ? err.message : '').not.toContain('test-access-token');
    }
  });

  it('cancel() abandonne l’upload TUS et rejette avec VideoUploadCancelledError', async () => {
    const blob = { size: 2_000_000 } as Blob;

    const handle = uploadVideoResumable('conv-1', 'user-1', picked, blob);
    await waitForCapturedOptions(() => capturedOptions);

    handle.cancel();

    await expect(handle.promise).rejects.toBeInstanceOf(VideoUploadCancelledError);
    expect(mockUploadInstance.abort).toHaveBeenCalledWith(true);
  });

  it('rejette sans jamais appeler tus.Upload si la session est expirée', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    const blob = { size: 2_000_000 } as Blob;

    const handle = uploadVideoResumable('conv-1', 'user-1', picked, blob);

    await expect(handle.promise).rejects.toThrow('Session expirée');
    expect(tus.Upload).not.toHaveBeenCalled();
  });

  it("retry() réutilise la même instance tus après une erreur réseau, sans en recréer une (reprise depuis le dernier octet)", async () => {
    const blob = { size: 2_000_000 } as Blob;
    const handle = uploadVideoResumable('conv-1', 'user-1', picked, blob);
    await waitForCapturedOptions(() => capturedOptions);

    expect(tus.Upload).toHaveBeenCalledTimes(1);
    expect(mockUploadInstance.start).toHaveBeenCalledTimes(1);

    capturedOptions?.onError?.(new Error('tus: network error'));
    await expect(handle.promise).rejects.toThrow("Impossible d'envoyer la vidéo");

    const retryPromise = handle.retry();

    // Toujours la même ressource tus : aucune nouvelle instance créée,
    // seulement une nouvelle tentative sur celle déjà en place.
    expect(tus.Upload).toHaveBeenCalledTimes(1);
    expect(mockUploadInstance.start).toHaveBeenCalledTimes(2);

    capturedOptions?.onSuccess?.({ lastResponse: {} as tus.HttpResponse });
    await expect(retryPromise).resolves.toEqual({
      storagePath: expect.stringMatching(/^conv-1\/user-1\/[0-9a-f-]{36}\.mp4$/),
      sizeBytes: 2_000_000,
    });
  });

  it('retry() relaie toujours la progression via le même callback onProgress après une reprise', async () => {
    const blob = { size: 2_000_000 } as Blob;
    const onProgress = jest.fn();
    const handle = uploadVideoResumable('conv-1', 'user-1', picked, blob, onProgress);
    await waitForCapturedOptions(() => capturedOptions);

    capturedOptions?.onError?.(new Error('tus: network error'));
    await expect(handle.promise).rejects.toThrow();

    const retryPromise = handle.retry();
    capturedOptions?.onProgress?.(1_800_000, 2_000_000);
    expect(onProgress).toHaveBeenCalledWith(90);

    capturedOptions?.onSuccess?.({ lastResponse: {} as tus.HttpResponse });
    await retryPromise;
  });

  it("retry() recrée une ressource complète si l'échec précédent est survenu avant sa création (ex. session expirée)", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const blob = { size: 2_000_000 } as Blob;
    const handle = uploadVideoResumable('conv-1', 'user-1', picked, blob);

    await expect(handle.promise).rejects.toThrow('Session expirée');
    expect(tus.Upload).not.toHaveBeenCalled();

    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'test-access-token' } }, error: null });
    const retryPromise = handle.retry();
    await waitForCapturedOptions(() => capturedOptions);

    expect(tus.Upload).toHaveBeenCalledTimes(1);

    capturedOptions?.onSuccess?.({ lastResponse: {} as tus.HttpResponse });
    await expect(retryPromise).resolves.toEqual(expect.objectContaining({ sizeBytes: 2_000_000 }));
  });

  it('retry() après cancel() rejette immédiatement : la ressource est terminée côté serveur, jamais reprise', async () => {
    const blob = { size: 2_000_000 } as Blob;
    const handle = uploadVideoResumable('conv-1', 'user-1', picked, blob);
    await waitForCapturedOptions(() => capturedOptions);

    handle.cancel();
    await expect(handle.promise).rejects.toBeInstanceOf(VideoUploadCancelledError);

    await expect(handle.retry()).rejects.toThrow("Impossible d'envoyer la vidéo");
    // start() n'a jamais été rappelé après le cancel : pas de reprise sur une
    // ressource déjà terminée côté serveur.
    expect(mockUploadInstance.start).toHaveBeenCalledTimes(1);
  });
});

/** Attend que le prochain tick microtâche ait laissé `uploadVideoResumable` appeler `tus.Upload`. */
async function waitForCapturedOptions(getOptions: () => tus.UploadOptions | undefined): Promise<void> {
  for (let i = 0; i < 10 && !getOptions(); i++) {
    await Promise.resolve();
  }
}
