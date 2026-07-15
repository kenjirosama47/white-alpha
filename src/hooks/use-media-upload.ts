import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/contexts/auth-context';
import {
  pickImageFromLibrary,
  pickVideoFromLibrary,
  recoverPendingMediaPick,
  removeAttachmentFile,
  uploadAttachment,
  uploadVideoResumable,
  VideoUploadCancelledError,
  type PickedMedia,
} from '@/services/media';
import { sendImageMessage, sendVideoMessage } from '@/services/messages';
import type { Message } from '@/types/chat';

type UseMediaUploadResult = {
  pickedMedia: PickedMedia | null;
  isUploading: boolean;
  /** Pourcentage 0-100 pendant l'upload d'une vidéo ; `null` sinon. */
  uploadProgress: number | null;
  error: string | null;
  pickImage: () => Promise<void>;
  pickVideo: () => Promise<void>;
  /** Retire le média sélectionné (avant envoi). Sans effet pendant un upload en cours. */
  cancel: () => void;
  /** Annule un upload vidéo en cours ; la sélection reste affichée pour permettre de réessayer. */
  cancelUpload: () => void;
  /** Envoie le média sélectionné avec une légende optionnelle. Retourne le message créé, ou `null` en cas d'échec/annulation. */
  send: (caption?: string) => Promise<Message | null>;
};

/**
 * Sélection + upload + envoi d'un média (photo ou vidéo) dans une
 * conversation. Protège contre le double envoi (ref, comme
 * `useMessages.send`) et contre deux uploads médias simultanés (une seule
 * sélection à la fois par instance de ce hook, une par écran de
 * conversation). Nettoie le fichier Storage si la création du message
 * échoue après upload.
 */
export function useMediaUpload(conversationId: string): UseMediaUploadResult {
  const { session } = useAuth();
  const [pickedMedia, setPickedMedia] = useState<PickedMedia | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSendingRef = useRef(false);
  const cancelVideoUploadRef = useRef<(() => void) | null>(null);

  // Sur Android, le système peut avoir détruit l'activité pendant qu'un
  // sélecteur était ouvert avant le montage de ce hook : on récupère le
  // résultat perdu une fois au montage plutôt que de le perdre.
  useEffect(() => {
    let cancelled = false;
    recoverPendingMediaPick()
      .then((recovered) => {
        if (!cancelled && recovered) setPickedMedia(recovered);
      })
      .catch(() => {
        // Rien à récupérer : ignoré silencieusement.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pickImage = useCallback(async () => {
    setError(null);
    try {
      const image = await pickImageFromLibrary();
      if (image) {
        setPickedMedia({ kind: 'image', data: image });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    }
  }, []);

  const pickVideo = useCallback(async () => {
    setError(null);
    try {
      const video = await pickVideoFromLibrary();
      if (video) {
        setPickedMedia({ kind: 'video', data: video });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue.');
    }
  }, []);

  const cancel = useCallback(() => {
    setPickedMedia(null);
    setError(null);
    setUploadProgress(null);
  }, []);

  const cancelUpload = useCallback(() => {
    cancelVideoUploadRef.current?.();
  }, []);

  const send = useCallback(
    async (caption: string = '') => {
      if (isSendingRef.current || !pickedMedia || !session?.user.id) return null;
      isSendingRef.current = true;
      setIsUploading(true);
      setError(null);
      setUploadProgress(pickedMedia.kind === 'video' ? 0 : null);

      let uploadedStoragePath: string | null = null;
      try {
        let message: Message;

        if (pickedMedia.kind === 'image') {
          const uploaded = await uploadAttachment(conversationId, session.user.id, pickedMedia.data);
          uploadedStoragePath = uploaded.storagePath;

          message = await sendImageMessage({
            conversationId,
            storagePath: uploaded.storagePath,
            mimeType: pickedMedia.data.mimeType,
            sizeBytes: uploaded.sizeBytes,
            width: pickedMedia.data.width,
            height: pickedMedia.data.height,
            content: caption,
          });
        } else {
          const response = await fetch(pickedMedia.data.uri);
          const blob = await response.blob();

          const handle = uploadVideoResumable(conversationId, session.user.id, pickedMedia.data, blob, (percent) => {
            setUploadProgress(percent);
          });
          cancelVideoUploadRef.current = handle.cancel;

          const uploaded = await handle.promise;
          uploadedStoragePath = uploaded.storagePath;

          message = await sendVideoMessage({
            conversationId,
            storagePath: uploaded.storagePath,
            mimeType: pickedMedia.data.mimeType,
            sizeBytes: uploaded.sizeBytes,
            durationMs: pickedMedia.data.durationMs ?? 0,
            width: pickedMedia.data.width,
            height: pickedMedia.data.height,
            content: caption,
          });
        }

        setPickedMedia(null);
        return message;
      } catch (err) {
        // La création du message (RPC) a échoué après un upload réussi : le
        // fichier ne doit jamais rester orphelin dans le bucket.
        if (uploadedStoragePath) {
          await removeAttachmentFile(uploadedStoragePath);
        }
        if (err instanceof VideoUploadCancelledError) {
          // Annulation volontaire : pas une erreur, la sélection reste
          // affichée pour permettre de réessayer sans re-choisir le fichier.
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : "Impossible d'envoyer le média pour le moment.");
        }
        return null;
      } finally {
        cancelVideoUploadRef.current = null;
        isSendingRef.current = false;
        setIsUploading(false);
        setUploadProgress(null);
      }
    },
    [conversationId, pickedMedia, session],
  );

  return { pickedMedia, isUploading, uploadProgress, error, pickImage, pickVideo, cancel, cancelUpload, send };
}
