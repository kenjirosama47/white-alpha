import { useCallback, useRef, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import { pickImageFromLibrary, removeAttachmentFile, uploadAttachment, type PickedImage } from '@/services/media';
import { sendImageMessage } from '@/services/messages';
import type { Message } from '@/types/chat';

type UseMediaUploadResult = {
  pickedImage: PickedImage | null;
  isUploading: boolean;
  error: string | null;
  pick: () => Promise<void>;
  cancel: () => void;
  /** Envoie l'image sélectionnée avec une légende optionnelle. Retourne le message créé, ou `null` en cas d'échec. */
  send: (caption?: string) => Promise<Message | null>;
};

/**
 * Sélection + upload + envoi d'une image dans une conversation. Protège
 * contre le double envoi (ref, comme `useMessages.send`) et nettoie le
 * fichier Storage si la création du message échoue après upload.
 */
export function useMediaUpload(conversationId: string): UseMediaUploadResult {
  const { session } = useAuth();
  const [pickedImage, setPickedImage] = useState<PickedImage | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSendingRef = useRef(false);

  const pick = useCallback(async () => {
    setError(null);
    try {
      const image = await pickImageFromLibrary();
      if (image) {
        setPickedImage(image);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    }
  }, []);

  const cancel = useCallback(() => {
    setPickedImage(null);
    setError(null);
  }, []);

  const send = useCallback(
    async (caption: string = '') => {
      if (isSendingRef.current || !pickedImage || !session?.user.id) return null;
      isSendingRef.current = true;
      setIsUploading(true);
      setError(null);

      let uploadedStoragePath: string | null = null;
      try {
        const uploaded = await uploadAttachment(conversationId, session.user.id, pickedImage);
        uploadedStoragePath = uploaded.storagePath;

        const message = await sendImageMessage({
          conversationId,
          storagePath: uploaded.storagePath,
          mimeType: pickedImage.mimeType,
          sizeBytes: uploaded.sizeBytes,
          width: pickedImage.width,
          height: pickedImage.height,
          content: caption,
        });

        setPickedImage(null);
        return message;
      } catch (err) {
        // La création du message (RPC) a échoué après un upload réussi : le
        // fichier ne doit jamais rester orphelin dans le bucket.
        if (uploadedStoragePath) {
          await removeAttachmentFile(uploadedStoragePath);
        }
        setError(err instanceof Error ? err.message : "Impossible d'envoyer l'image pour le moment.");
        return null;
      } finally {
        isSendingRef.current = false;
        setIsUploading(false);
      }
    },
    [conversationId, pickedImage, session],
  );

  return { pickedImage, isUploading, error, pick, cancel, send };
}
