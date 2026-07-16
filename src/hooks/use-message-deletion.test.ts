import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMessageDeletion } from '@/hooks/use-message-deletion';
import { removeAttachmentFileOrThrow } from '@/services/media';
import { deleteOwnMessage } from '@/services/messages';
import type { Message } from '@/types/chat';

jest.mock('@/services/media', () => ({
  removeAttachmentFileOrThrow: jest.fn(),
}));

jest.mock('@/services/messages', () => ({
  deleteOwnMessage: jest.fn(),
}));

const textMessage: Message = {
  id: 'm-text',
  conversationId: 'conv-1',
  senderId: 'user-1',
  content: 'Salut',
  createdAt: '2026-07-16T10:00:00Z',
  attachment: null,
};

const photoMessage: Message = {
  id: 'm-photo',
  conversationId: 'conv-1',
  senderId: 'user-1',
  content: '',
  createdAt: '2026-07-16T10:00:00Z',
  attachment: {
    id: 'att-1',
    messageId: 'm-photo',
    conversationId: 'conv-1',
    uploaderId: 'user-1',
    mediaType: 'image',
    storagePath: 'conv-1/user-1/photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1000,
    width: 100,
    height: 100,
    createdAt: '2026-07-16T10:00:00Z',
  },
};

const videoMessage: Message = {
  ...photoMessage,
  id: 'm-video',
  attachment: {
    ...photoMessage.attachment!,
    id: 'att-2',
    messageId: 'm-video',
    mediaType: 'video',
    mimeType: 'video/mp4',
    storagePath: 'conv-1/user-1/clip.mp4',
    durationMs: 5000,
  },
};

describe('useMessageDeletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('getDeletionState retourne null pour un message jamais touché', async () => {
    const { result } = await renderHook(() => useMessageDeletion(jest.fn()));
    expect(result.current.getDeletionState('inconnu')).toBeNull();
  });

  it('supprime un message texte : appelle uniquement deleteOwnMessage, jamais le Storage', async () => {
    (deleteOwnMessage as jest.Mock).mockResolvedValue({ messageId: 'm-text', messageType: 'text', storagePath: null });
    const onDeleted = jest.fn();
    const { result } = await renderHook(() => useMessageDeletion(onDeleted));

    await act(async () => {
      result.current.deleteMessage(textMessage);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(removeAttachmentFileOrThrow).not.toHaveBeenCalled();
    expect(deleteOwnMessage).toHaveBeenCalledWith('m-text');
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('m-text'));
    expect(result.current.getDeletionState('m-text')).toBeNull();
  });

  it('supprime une photo : supprime le fichier Storage exact puis le message, dans cet ordre', async () => {
    const callOrder: string[] = [];
    (removeAttachmentFileOrThrow as jest.Mock).mockImplementation(async () => {
      callOrder.push('storage');
    });
    (deleteOwnMessage as jest.Mock).mockImplementation(async () => {
      callOrder.push('db');
      return { messageId: 'm-photo', messageType: 'image', storagePath: 'conv-1/user-1/photo.jpg' };
    });
    const onDeleted = jest.fn();
    const { result } = await renderHook(() => useMessageDeletion(onDeleted));

    await act(async () => {
      result.current.deleteMessage(photoMessage);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(removeAttachmentFileOrThrow).toHaveBeenCalledWith('conv-1/user-1/photo.jpg');
    expect(callOrder).toEqual(['storage', 'db']);
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('m-photo'));
  });

  it('supprime une vidéo : supprime le fichier Storage exact puis le message', async () => {
    (removeAttachmentFileOrThrow as jest.Mock).mockResolvedValue(undefined);
    (deleteOwnMessage as jest.Mock).mockResolvedValue({
      messageId: 'm-video',
      messageType: 'video',
      storagePath: 'conv-1/user-1/clip.mp4',
    });
    const onDeleted = jest.fn();
    const { result } = await renderHook(() => useMessageDeletion(onDeleted));

    await act(async () => {
      result.current.deleteMessage(videoMessage);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(removeAttachmentFileOrThrow).toHaveBeenCalledWith('conv-1/user-1/clip.mp4');
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('m-video'));
  });

  it('ne supprime jamais un autre chemin Storage que celui du message', async () => {
    (removeAttachmentFileOrThrow as jest.Mock).mockResolvedValue(undefined);
    (deleteOwnMessage as jest.Mock).mockResolvedValue({ messageId: 'm-photo', messageType: 'image', storagePath: null });
    const { result } = await renderHook(() => useMessageDeletion(jest.fn()));

    await act(async () => {
      result.current.deleteMessage(photoMessage);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(removeAttachmentFileOrThrow).toHaveBeenCalledTimes(1);
    expect(removeAttachmentFileOrThrow).toHaveBeenCalledWith(photoMessage.attachment!.storagePath);
  });

  it('échec Storage : la base reste intacte (deleteOwnMessage jamais appelé), état error exposé', async () => {
    (removeAttachmentFileOrThrow as jest.Mock).mockRejectedValue(
      new Error('Impossible de supprimer le fichier pour le moment.'),
    );
    const { result } = await renderHook(() => useMessageDeletion(jest.fn()));

    await act(async () => {
      result.current.deleteMessage(photoMessage);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deleteOwnMessage).not.toHaveBeenCalled();
    expect(result.current.getDeletionState('m-photo')).toEqual({
      status: 'error',
      error: 'Impossible de supprimer le fichier pour le moment.',
    });
  });

  it('échec DB après Storage déjà supprimé : nouvelles tentatives automatiques, jamais un second appel Storage', async () => {
    jest.useFakeTimers();
    (removeAttachmentFileOrThrow as jest.Mock).mockResolvedValue(undefined);
    (deleteOwnMessage as jest.Mock).mockRejectedValue(new Error('Impossible de supprimer le message pour le moment.'));
    const { result } = await renderHook(() => useMessageDeletion(jest.fn()));

    await act(async () => {
      result.current.deleteMessage(photoMessage);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(removeAttachmentFileOrThrow).toHaveBeenCalledTimes(1);
    expect(deleteOwnMessage).toHaveBeenCalledTimes(1);
    expect(result.current.getDeletionState('m-photo')?.status).toBe('deleting');

    // Première reprise automatique (délai le plus court).
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(deleteOwnMessage).toHaveBeenCalledTimes(2);
    // Le fichier Storage n'est jamais re-supprimé pendant les reprises automatiques.
    expect(removeAttachmentFileOrThrow).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('après épuisement des tentatives automatiques, retryDeletion relance uniquement la base (jamais Storage à nouveau)', async () => {
    jest.useFakeTimers();
    (removeAttachmentFileOrThrow as jest.Mock).mockResolvedValue(undefined);
    (deleteOwnMessage as jest.Mock).mockRejectedValue(new Error('Impossible de supprimer le message pour le moment.'));
    const { result } = await renderHook(() => useMessageDeletion(jest.fn()));

    await act(async () => {
      result.current.deleteMessage(photoMessage);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Épuise les 3 délais de reprise automatique (2s, 4s, 8s).
    for (const delay of [2000, 4000, 8000]) {
      await act(async () => {
        jest.advanceTimersByTime(delay);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    expect(result.current.getDeletionState('m-photo')).toEqual({
      status: 'error',
      error: 'Impossible de supprimer le message pour le moment.',
    });
    const dbCallsBeforeManualRetry = (deleteOwnMessage as jest.Mock).mock.calls.length;

    jest.useRealTimers();
    (deleteOwnMessage as jest.Mock).mockResolvedValueOnce({
      messageId: 'm-photo',
      messageType: 'image',
      storagePath: 'conv-1/user-1/photo.jpg',
    });
    const onDeleted = jest.fn();

    await act(async () => {
      result.current.retryDeletion(photoMessage);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(removeAttachmentFileOrThrow).toHaveBeenCalledTimes(1); // toujours une seule fois, jamais relancé
    expect((deleteOwnMessage as jest.Mock).mock.calls.length).toBeGreaterThan(dbCallsBeforeManualRetry);
    void onDeleted;
  });

  it('protège contre le double appui sur Supprimer', async () => {
    let resolveStorage: () => void = () => {};
    (removeAttachmentFileOrThrow as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveStorage = resolve;
      }),
    );
    (deleteOwnMessage as jest.Mock).mockResolvedValue({ messageId: 'm-photo', messageType: 'image', storagePath: null });
    const { result, unmount } = await renderHook(() => useMessageDeletion(jest.fn()));

    act(() => {
      result.current.deleteMessage(photoMessage);
      // Second appui pendant que le premier est encore en vol : doit être ignoré.
      result.current.deleteMessage(photoMessage);
    });

    expect(removeAttachmentFileOrThrow).toHaveBeenCalledTimes(1);

    // Flush jusqu'à la fin complète de la suppression pour ne rien laisser en
    // vol : une mise à jour d'état tardive non flushée ici fuiterait sur le
    // test suivant (avertissement "act" et état imprévisible).
    await act(async () => {
      resolveStorage();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.getDeletionState('m-photo')).toBeNull();
    expect(deleteOwnMessage).toHaveBeenCalledTimes(1);
    unmount();
  });
});
