import { act, renderHook, waitFor } from '@testing-library/react';

import type { MediaUploadResult } from '@/lib/media-upload-client';
import * as mediaUploadClient from '@/lib/media-upload-client';

import { useAttachmentUpload } from './useAttachmentUpload';

jest.mock('@/lib/media-upload-client', () => {
  const actual = jest.requireActual('@/lib/media-upload-client');
  return {
    ...actual,
    uploadMediaAttachment: jest.fn(),
    probeVideoDurationMs: jest.fn(),
  };
});

const mockUploadMediaAttachment = mediaUploadClient.uploadMediaAttachment as jest.Mock;
const mockProbeVideoDurationMs = mediaUploadClient.probeVideoDurationMs as jest.Mock;

function makeImageFile(name = 'photo.jpg', type = 'image/jpeg', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

function makeVideoFile(name = 'video.mp4', type = 'video/mp4', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

const successBody: MediaUploadResult = {
  ok: true,
  message: { id: 'm1', conversationId: 'c1', senderId: 'u1', content: '', messageType: 'image', createdAt: '2026-01-01T00:00:00Z' },
};

describe('useAttachmentUpload (Phase 8.5.3)', () => {
  beforeEach(() => {
    mockUploadMediaAttachment.mockReset();
    mockProbeVideoDurationMs.mockReset();
    (URL.createObjectURL as jest.Mock).mockClear?.();
    (URL.revokeObjectURL as jest.Mock).mockClear?.();
  });

  it('sélection image valide : phase "selected", aperçu créé (URL locale)', () => {
    const { result } = renderHook(() => useAttachmentUpload('c1'));
    act(() => result.current.selectImage(makeImageFile()));

    expect(result.current.phase).toBe('selected');
    expect(result.current.attachment?.kind).toBe('image');
    expect(result.current.attachment?.previewUrl).toBe('blob:mock-url');
  });

  it('fichier invalide refusé immédiatement, jamais d’appel réseau', () => {
    const { result } = renderHook(() => useAttachmentUpload('c1'));
    act(() => result.current.selectImage(makeImageFile('bad.svg', 'image/svg+xml')));

    expect(result.current.phase).toBe('error');
    expect(result.current.attachment).toBeNull();
    expect(result.current.errorMessage).toBeTruthy();
    expect(mockUploadMediaAttachment).not.toHaveBeenCalled();
  });

  it('sélection vidéo : passe par "preparing" puis "selected" une fois la durée connue', async () => {
    mockProbeVideoDurationMs.mockResolvedValue(5000);
    const { result } = renderHook(() => useAttachmentUpload('c1'));

    act(() => result.current.selectVideo(makeVideoFile()));
    expect(result.current.phase).toBe('preparing');

    await waitFor(() => expect(result.current.phase).toBe('selected'));
    expect(result.current.attachment?.kind).toBe('video');
  });

  it('sonde de durée vidéo en échec : erreur contrôlée, jamais d’upload', async () => {
    mockProbeVideoDurationMs.mockRejectedValue(new Error('invalid_duration'));
    const { result } = renderHook(() => useAttachmentUpload('c1'));

    act(() => result.current.selectVideo(makeVideoFile()));
    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(mockUploadMediaAttachment).not.toHaveBeenCalled();
  });

  it('révoque l’URL locale au remplacement (nouvelle sélection)', () => {
    const { result } = renderHook(() => useAttachmentUpload('c1'));
    act(() => result.current.selectImage(makeImageFile('a.jpg')));
    (URL.revokeObjectURL as jest.Mock).mockClear();

    act(() => result.current.selectImage(makeImageFile('b.jpg')));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('révoque l’URL locale à l’annulation', () => {
    const { result } = renderHook(() => useAttachmentUpload('c1'));
    act(() => result.current.selectImage(makeImageFile()));
    (URL.revokeObjectURL as jest.Mock).mockClear();

    act(() => result.current.cancel());
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(result.current.phase).toBe('idle');
    expect(result.current.attachment).toBeNull();
  });

  it('révoque l’URL locale au démontage', () => {
    const { result, unmount } = renderHook(() => useAttachmentUpload('c1'));
    act(() => result.current.selectImage(makeImageFile()));
    (URL.revokeObjectURL as jest.Mock).mockClear();

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('envoi : progression réelle relayée, "uploading" → "processing" → "success"', async () => {
    let capturedOnProgress: (percent: number) => void = () => {};
    let capturedOnBodySent: () => void = () => {};
    let resolveUpload!: (result: MediaUploadResult) => void;
    const uploadPromise = new Promise<MediaUploadResult>((resolve) => {
      resolveUpload = resolve;
    });

    mockUploadMediaAttachment.mockImplementation((_c, _f, _cap, _key, _dur, onProgress, onBodySent) => {
      capturedOnProgress = onProgress;
      capturedOnBodySent = onBodySent;
      return { promise: uploadPromise, xhr: {} as XMLHttpRequest };
    });

    const { result } = renderHook(() => useAttachmentUpload('c1'));
    act(() => result.current.selectImage(makeImageFile()));
    act(() => result.current.send(''));

    expect(result.current.phase).toBe('uploading');

    act(() => capturedOnProgress(42));
    expect(result.current.progressPercent).toBe(42);

    act(() => capturedOnBodySent());
    expect(result.current.phase).toBe('processing');

    act(() => resolveUpload(successBody));
    await waitFor(() => expect(result.current.phase).toBe('success'));
  });

  it('double appel à send() pendant un envoi en cours : un seul appel réseau', () => {
    const uploadPromise = new Promise<MediaUploadResult>(() => {});
    mockUploadMediaAttachment.mockReturnValue({ promise: uploadPromise, xhr: {} as XMLHttpRequest });

    const { result } = renderHook(() => useAttachmentUpload('c1'));
    act(() => result.current.selectImage(makeImageFile()));
    act(() => {
      result.current.send('');
      result.current.send('');
    });

    expect(mockUploadMediaAttachment).toHaveBeenCalledTimes(1);
  });

  it('annuler pendant un envoi en cours : sans effet (verrou applicatif)', () => {
    const uploadPromise = new Promise<MediaUploadResult>(() => {});
    mockUploadMediaAttachment.mockReturnValue({ promise: uploadPromise, xhr: {} as XMLHttpRequest });

    const { result } = renderHook(() => useAttachmentUpload('c1'));
    act(() => result.current.selectImage(makeImageFile()));
    act(() => result.current.send(''));
    act(() => result.current.cancel());

    expect(result.current.phase).toBe('uploading');
    expect(result.current.attachment).not.toBeNull();
  });

  it('échec puis réessai : message générique, même File et même clé d’idempotence réutilisés', async () => {
    const capturedKeys: string[] = [];
    const capturedFiles: File[] = [];

    mockUploadMediaAttachment
      .mockImplementationOnce((_c, file, _cap, key) => {
        capturedKeys.push(key);
        capturedFiles.push(file);
        return { promise: Promise.resolve({ ok: false, code: 'network_error' } as MediaUploadResult), xhr: {} as XMLHttpRequest };
      })
      .mockImplementationOnce((_c, file, _cap, key) => {
        capturedKeys.push(key);
        capturedFiles.push(file);
        return { promise: Promise.resolve(successBody), xhr: {} as XMLHttpRequest };
      });

    const { result } = renderHook(() => useAttachmentUpload('c1'));
    const file = makeImageFile();
    act(() => result.current.selectImage(file));
    act(() => result.current.send(''));

    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.errorMessage).toBeTruthy();
    expect(result.current.attachment?.file).toBe(file);

    act(() => result.current.retry(''));
    await waitFor(() => expect(result.current.phase).toBe('success'));

    expect(mockUploadMediaAttachment).toHaveBeenCalledTimes(2);
    expect(capturedKeys[0]).toBe(capturedKeys[1]);
    expect(capturedFiles[0]).toBe(file);
    expect(capturedFiles[1]).toBe(file);
  });

  it('annulation après une erreur : fonctionne normalement', async () => {
    mockUploadMediaAttachment.mockReturnValue({
      promise: Promise.resolve({ ok: false, code: 'upload_failed' } as MediaUploadResult),
      xhr: {} as XMLHttpRequest,
    });

    const { result } = renderHook(() => useAttachmentUpload('c1'));
    act(() => result.current.selectImage(makeImageFile()));
    act(() => result.current.send(''));
    await waitFor(() => expect(result.current.phase).toBe('error'));

    act(() => result.current.cancel());
    expect(result.current.phase).toBe('idle');
    expect(result.current.attachment).toBeNull();
  });

  it('message d’erreur toujours générique (jamais de détail brut, jamais un chemin/token)', async () => {
    mockUploadMediaAttachment.mockReturnValue({
      promise: Promise.resolve({ ok: false, code: 'send_failed' } as MediaUploadResult),
      xhr: {} as XMLHttpRequest,
    });

    const { result } = renderHook(() => useAttachmentUpload('c1'));
    act(() => result.current.selectImage(makeImageFile()));
    act(() => result.current.send(''));
    await waitFor(() => expect(result.current.phase).toBe('error'));

    expect(result.current.errorMessage).toBe("Impossible d'envoyer le média pour le moment.");
    expect(result.current.errorMessage).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // aucun UUID/chemin Storage
  });
});
