import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useMediaUpload } from '@/hooks/use-media-upload';
import { pickImageFromLibrary, removeAttachmentFile, uploadAttachment } from '@/services/media';
import { sendImageMessage } from '@/services/messages';

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

jest.mock('@/services/media', () => ({
  pickImageFromLibrary: jest.fn(),
  uploadAttachment: jest.fn(),
  removeAttachmentFile: jest.fn(),
}));

jest.mock('@/services/messages', () => ({
  sendImageMessage: jest.fn(),
}));

const picked = { uri: 'file:///photo.jpg', mimeType: 'image/jpeg' as const, sizeBytes: 1000, width: 10, height: 10 };

describe('useMediaUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sélection annulée : pickedImage reste null, aucune erreur", async () => {
    (pickImageFromLibrary as jest.Mock).mockResolvedValue(null);
    const { result } = await renderHook(() => useMediaUpload('conv-1'));

    await act(async () => {
      await result.current.pick();
    });

    expect(result.current.pickedImage).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('pick() en échec (ex. permission refusée) expose un message d’erreur', async () => {
    (pickImageFromLibrary as jest.Mock).mockRejectedValue(new Error('Accès à tes photos refusé.'));
    const { result } = await renderHook(() => useMediaUpload('conv-1'));

    await act(async () => {
      await result.current.pick();
    });

    expect(result.current.pickedImage).toBeNull();
    expect(result.current.error).toBe('Accès à tes photos refusé.');
  });

  it('send() sans image sélectionnée ne fait rien et retourne null', async () => {
    const { result } = await renderHook(() => useMediaUpload('conv-1'));

    const outcome = await act(async () => result.current.send());

    expect(outcome).toBeNull();
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it('protège contre le double envoi tant qu’un envoi est déjà en cours', async () => {
    (pickImageFromLibrary as jest.Mock).mockResolvedValue(picked);
    let resolveUpload: (value: unknown) => void = () => {};
    (uploadAttachment as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    (sendImageMessage as jest.Mock).mockResolvedValue({ id: 'm1' });

    const { result } = await renderHook(() => useMediaUpload('conv-1'));
    await act(async () => {
      await result.current.pick();
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

  it("échec d'upload : erreur exposée, aucun fichier à nettoyer (rien n'a été uploadé)", async () => {
    (pickImageFromLibrary as jest.Mock).mockResolvedValue(picked);
    (uploadAttachment as jest.Mock).mockRejectedValue(new Error("Impossible d'envoyer l'image pour le moment."));

    const { result } = await renderHook(() => useMediaUpload('conv-1'));
    await act(async () => {
      await result.current.pick();
    });

    await act(async () => {
      await result.current.send();
    });

    expect(removeAttachmentFile).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Impossible d'envoyer l'image pour le moment.");
    // L'image reste sélectionnée : l'utilisateur peut réessayer sans la re-choisir.
    expect(result.current.pickedImage).toEqual(picked);
  });

  it('nettoie le fichier Storage si la création du message échoue après un upload réussi', async () => {
    (pickImageFromLibrary as jest.Mock).mockResolvedValue(picked);
    (uploadAttachment as jest.Mock).mockResolvedValue({ storagePath: 'conv-1/user-1/abc.jpg', sizeBytes: 1000 });
    (sendImageMessage as jest.Mock).mockRejectedValue(new Error('Conversation introuvable.'));

    const { result } = await renderHook(() => useMediaUpload('conv-1'));
    await act(async () => {
      await result.current.pick();
    });

    await act(async () => {
      await result.current.send();
    });

    expect(removeAttachmentFile).toHaveBeenCalledWith('conv-1/user-1/abc.jpg');
    expect(result.current.error).toBe('Conversation introuvable.');
    expect(result.current.pickedImage).toEqual(picked);
  });

  it('succès : envoie le message, vide la sélection, ne nettoie rien', async () => {
    (pickImageFromLibrary as jest.Mock).mockResolvedValue(picked);
    (uploadAttachment as jest.Mock).mockResolvedValue({ storagePath: 'conv-1/user-1/abc.jpg', sizeBytes: 1000 });
    (sendImageMessage as jest.Mock).mockResolvedValue({ id: 'm1', conversationId: 'conv-1' });

    const { result } = await renderHook(() => useMediaUpload('conv-1'));
    await act(async () => {
      await result.current.pick();
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.send('Légende');
    });

    expect(outcome).toEqual({ id: 'm1', conversationId: 'conv-1' });
    expect(sendImageMessage).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', storagePath: 'conv-1/user-1/abc.jpg', content: 'Légende' }),
    );
    await waitFor(() => expect(result.current.pickedImage).toBeNull());
    expect(removeAttachmentFile).not.toHaveBeenCalled();
  });
});
