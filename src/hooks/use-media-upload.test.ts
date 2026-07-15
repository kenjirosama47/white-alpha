import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMediaUpload } from '@/hooks/use-media-upload';
import {
  pickImageFromLibrary,
  pickVideoFromLibrary,
  recoverPendingMediaPick,
  removeAttachmentFile,
  uploadAttachment,
  uploadVideoResumable,
  VideoUploadCancelledError,
} from '@/services/media';
import { sendImageMessage, sendVideoMessage } from '@/services/messages';

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

jest.mock('@/services/media', () => {
  class MockVideoUploadCancelledError extends Error {
    constructor() {
      super('Envoi de la vidéo annulé.');
      this.name = 'VideoUploadCancelledError';
    }
  }
  return {
    pickImageFromLibrary: jest.fn(),
    pickVideoFromLibrary: jest.fn(),
    recoverPendingMediaPick: jest.fn().mockResolvedValue(null),
    uploadAttachment: jest.fn(),
    uploadVideoResumable: jest.fn(),
    removeAttachmentFile: jest.fn(),
    VideoUploadCancelledError: MockVideoUploadCancelledError,
  };
});

jest.mock('@/services/messages', () => ({
  sendImageMessage: jest.fn(),
  sendVideoMessage: jest.fn(),
}));

const pickedImage = { uri: 'file:///photo.jpg', mimeType: 'image/jpeg' as const, sizeBytes: 1000, width: 10, height: 10 };
const pickedVideo = {
  uri: 'file:///clip.mp4',
  mimeType: 'video/mp4' as const,
  sizeBytes: 2_000_000,
  durationMs: 15_000,
  width: 1280,
  height: 720,
};

describe('useMediaUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (recoverPendingMediaPick as jest.Mock).mockResolvedValue(null);
  });

  it('récupère un pick Android perdu au montage (activité détruite pendant le sélecteur)', async () => {
    (recoverPendingMediaPick as jest.Mock).mockResolvedValue({ kind: 'image', data: pickedImage });

    const { result } = await renderHook(() => useMediaUpload('conv-1'));

    await waitFor(() => expect(result.current.pickedMedia).toEqual({ kind: 'image', data: pickedImage }));
  });

  it('sélection de photo annulée : pickedMedia reste null, aucune erreur', async () => {
    (pickImageFromLibrary as jest.Mock).mockResolvedValue(null);
    const { result } = await renderHook(() => useMediaUpload('conv-1'));

    await act(async () => {
      await result.current.pickImage();
    });

    expect(result.current.pickedMedia).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('sélection de vidéo annulée : pickedMedia reste null, aucune erreur', async () => {
    (pickVideoFromLibrary as jest.Mock).mockResolvedValue(null);
    const { result } = await renderHook(() => useMediaUpload('conv-1'));

    await act(async () => {
      await result.current.pickVideo();
    });

    expect(result.current.pickedMedia).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('pickVideo() en échec (ex. permission refusée) expose un message d’erreur', async () => {
    (pickVideoFromLibrary as jest.Mock).mockRejectedValue(new Error('Accès à tes vidéos refusé.'));
    const { result } = await renderHook(() => useMediaUpload('conv-1'));

    await act(async () => {
      await result.current.pickVideo();
    });

    expect(result.current.pickedMedia).toBeNull();
    expect(result.current.error).toBe('Accès à tes vidéos refusé.');
  });

  it('pickVideo() sélectionne bien une vidéo (kind: video)', async () => {
    (pickVideoFromLibrary as jest.Mock).mockResolvedValue(pickedVideo);
    const { result } = await renderHook(() => useMediaUpload('conv-1'));

    await act(async () => {
      await result.current.pickVideo();
    });

    expect(result.current.pickedMedia).toEqual({ kind: 'video', data: pickedVideo });
  });

  it('send() sans média sélectionné ne fait rien et retourne null', async () => {
    const { result } = await renderHook(() => useMediaUpload('conv-1'));

    const outcome = await act(async () => result.current.send());

    expect(outcome).toBeNull();
    expect(uploadAttachment).not.toHaveBeenCalled();
    expect(uploadVideoResumable).not.toHaveBeenCalled();
  });

  it('protège contre le double envoi (photo) tant qu’un envoi est déjà en cours', async () => {
    (pickImageFromLibrary as jest.Mock).mockResolvedValue(pickedImage);
    let resolveUpload: (value: unknown) => void = () => {};
    (uploadAttachment as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    (sendImageMessage as jest.Mock).mockResolvedValue({ id: 'm1' });

    const { result } = await renderHook(() => useMediaUpload('conv-1'));
    await act(async () => {
      await result.current.pickImage();
    });

    const firstSend = result.current.send();
    // Second envoi pendant que le premier est encore en vol : doit être ignoré.
    result.current.send();

    expect(uploadAttachment).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUpload({ storagePath: 'conv-1/user-1/abc.jpg', sizeBytes: 1000 });
      await firstSend;
    });
  });

  it("échec d'upload photo : erreur exposée, aucun fichier à nettoyer (rien n'a été uploadé)", async () => {
    (pickImageFromLibrary as jest.Mock).mockResolvedValue(pickedImage);
    (uploadAttachment as jest.Mock).mockRejectedValue(new Error("Impossible d'envoyer l'image pour le moment."));

    const { result } = await renderHook(() => useMediaUpload('conv-1'));
    await act(async () => {
      await result.current.pickImage();
    });

    await act(async () => {
      await result.current.send();
    });

    expect(removeAttachmentFile).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Impossible d'envoyer l'image pour le moment.");
    expect(result.current.pickedMedia).toEqual({ kind: 'image', data: pickedImage });
  });

  it('nettoie le fichier Storage si la création du message (photo) échoue après un upload réussi', async () => {
    (pickImageFromLibrary as jest.Mock).mockResolvedValue(pickedImage);
    (uploadAttachment as jest.Mock).mockResolvedValue({ storagePath: 'conv-1/user-1/abc.jpg', sizeBytes: 1000 });
    (sendImageMessage as jest.Mock).mockRejectedValue(new Error('Conversation introuvable.'));

    const { result } = await renderHook(() => useMediaUpload('conv-1'));
    await act(async () => {
      await result.current.pickImage();
    });

    await act(async () => {
      await result.current.send();
    });

    expect(removeAttachmentFile).toHaveBeenCalledWith('conv-1/user-1/abc.jpg');
    expect(result.current.error).toBe('Conversation introuvable.');
  });

  it('succès (photo) : envoie le message, vide la sélection, ne nettoie rien', async () => {
    (pickImageFromLibrary as jest.Mock).mockResolvedValue(pickedImage);
    (uploadAttachment as jest.Mock).mockResolvedValue({ storagePath: 'conv-1/user-1/abc.jpg', sizeBytes: 1000 });
    (sendImageMessage as jest.Mock).mockResolvedValue({ id: 'm1', conversationId: 'conv-1' });

    const { result } = await renderHook(() => useMediaUpload('conv-1'));
    await act(async () => {
      await result.current.pickImage();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.send('Légende');
    });

    expect(outcome).toEqual({ id: 'm1', conversationId: 'conv-1' });
    await waitFor(() => expect(result.current.pickedMedia).toBeNull());
    expect(removeAttachmentFile).not.toHaveBeenCalled();
  });

  it('succès (vidéo) : upload TUS avec progression, envoie le message, vide la sélection', async () => {
    (pickVideoFromLibrary as jest.Mock).mockResolvedValue(pickedVideo);
    let progressCallback: ((percent: number) => void) | undefined;
    (uploadVideoResumable as jest.Mock).mockImplementation((_conv, _uploader, _video, _blob, onProgress) => {
      progressCallback = onProgress;
      return {
        promise: Promise.resolve().then(() => {
          progressCallback?.(50);
          progressCallback?.(100);
          return { storagePath: 'conv-1/user-1/clip.mp4', sizeBytes: 2_000_000 };
        }),
        cancel: jest.fn(),
      };
    });
    (sendVideoMessage as jest.Mock).mockResolvedValue({ id: 'm2', conversationId: 'conv-1' });

    // global.fetch().blob() est utilisé par le hook pour obtenir le Blob avant l'upload.
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      blob: () => Promise.resolve({ size: 2_000_000 }),
    });

    const { result } = await renderHook(() => useMediaUpload('conv-1'));
    await act(async () => {
      await result.current.pickVideo();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.send();
    });

    expect(outcome).toEqual({ id: 'm2', conversationId: 'conv-1' });
    expect(sendVideoMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        storagePath: 'conv-1/user-1/clip.mp4',
        mimeType: 'video/mp4',
        durationMs: 15_000,
      }),
    );
    await waitFor(() => expect(result.current.pickedMedia).toBeNull());
    expect(removeAttachmentFile).not.toHaveBeenCalled();
  });

  it("nettoie le fichier Storage si la création du message (vidéo) échoue après un upload réussi", async () => {
    (pickVideoFromLibrary as jest.Mock).mockResolvedValue(pickedVideo);
    (uploadVideoResumable as jest.Mock).mockReturnValue({
      promise: Promise.resolve({ storagePath: 'conv-1/user-1/clip.mp4', sizeBytes: 2_000_000 }),
      cancel: jest.fn(),
    });
    (sendVideoMessage as jest.Mock).mockRejectedValue(new Error('Conversation introuvable.'));
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      blob: () => Promise.resolve({ size: 2_000_000 }),
    });

    const { result } = await renderHook(() => useMediaUpload('conv-1'));
    await act(async () => {
      await result.current.pickVideo();
    });

    await act(async () => {
      await result.current.send();
    });

    expect(removeAttachmentFile).toHaveBeenCalledWith('conv-1/user-1/clip.mp4');
    expect(result.current.error).toBe('Conversation introuvable.');
  });

  it("cancelUpload() annule l'upload vidéo en cours sans afficher d'erreur, la sélection reste affichée", async () => {
    (pickVideoFromLibrary as jest.Mock).mockResolvedValue(pickedVideo);
    const cancelFn = jest.fn();
    let rejectPromise: ((err: unknown) => void) | undefined;
    (uploadVideoResumable as jest.Mock).mockImplementation(() => ({
      promise: new Promise((_resolve, reject) => {
        rejectPromise = reject;
      }),
      cancel: () => {
        cancelFn();
        rejectPromise?.(new VideoUploadCancelledError());
      },
    }));
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      blob: () => Promise.resolve({ size: 2_000_000 }),
    });

    const { result } = await renderHook(() => useMediaUpload('conv-1'));
    await act(async () => {
      await result.current.pickVideo();
    });

    const sendPromise = result.current.send();
    await waitFor(() => expect(uploadVideoResumable).toHaveBeenCalled());

    await act(async () => {
      result.current.cancelUpload();
      await sendPromise;
    });

    expect(cancelFn).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.pickedMedia).toEqual({ kind: 'video', data: pickedVideo });
    expect(sendVideoMessage).not.toHaveBeenCalled();
    expect(removeAttachmentFile).not.toHaveBeenCalled();
  });
});
