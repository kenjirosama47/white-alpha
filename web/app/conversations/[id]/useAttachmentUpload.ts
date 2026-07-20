'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { validateMediaFileForUpload } from '@/lib/media-client-validation';
import type { MediaKind } from '@/lib/media-config';
import { mediaUploadErrorMessage, probeVideoDurationMs, uploadMediaAttachment } from '@/lib/media-upload-client';

/**
 * États distincts (Phase 8.5.3, exigence explicite) : `preparing` (sonde de
 * durée vidéo en cours, avant que l'aperçu soit prêt), `selected` (prêt à
 * envoyer), `uploading` (progression réelle connue), `processing` (tous les
 * octets envoyés, réponse serveur pas encore reçue — jamais de progression
 * simulée pendant cette étape), `success`, `error`.
 */
export type AttachmentSendPhase = 'idle' | 'preparing' | 'selected' | 'uploading' | 'processing' | 'success' | 'error';

export type SelectedAttachment = {
  file: File;
  kind: MediaKind;
  previewUrl: string;
};

export type UseAttachmentUploadResult = {
  attachment: SelectedAttachment | null;
  phase: AttachmentSendPhase;
  /** Pourcentage 0-100 pendant `uploading` uniquement ; `null` dans tout autre état (jamais une valeur simulée). */
  progressPercent: number | null;
  errorMessage: string | null;
  selectImage: (file: File) => void;
  selectVideo: (file: File) => void;
  /** Retire la sélection et révoque l'URL locale — sans effet pendant un envoi en cours (voir `isSendingRef`). */
  cancel: () => void;
  send: (caption: string) => void;
  /** Réutilise le même `File` et la même clé d'idempotence que la tentative précédente — jamais un nouvel upload depuis zéro. */
  retry: (caption: string) => void;
};

/** Brève confirmation visuelle ("Envoyé") avant la remise à zéro complète — jamais un état permanent, purement UX. */
const SUCCESS_RESET_DELAY_MS = 1200;

/**
 * Sélection + upload d'une pièce jointe unique dans une conversation Web
 * (Phase 8.5.3). Protège contre le double envoi/l'annulation pendant un
 * envoi en cours via `isSendingRef` (même principe que `useMessages.send`,
 * Phase 8.4) — défense en profondeur en plus du verrou d'idempotence côté
 * serveur (Phase 8.5.2), jamais une confiance aveugle dans le seul état de
 * chargement React. L'URL locale (`URL.createObjectURL`) n'est jamais
 * persistée dans un stockage navigateur durable (stockage local, stockage de
 * session, cache applicatif) et est systématiquement révoquée : au
 * remplacement, à l'annulation, à la réussite et au démontage du composant.
 */
export function useAttachmentUpload(conversationId: string, onSendSuccess?: () => void): UseAttachmentUploadResult {
  const [attachment, setAttachment] = useState<SelectedAttachment | null>(null);
  const [phase, setPhase] = useState<AttachmentSendPhase>('idle');
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const previewUrlRef = useRef<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const isSendingRef = useRef(false);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionRequestIdRef = useRef(0);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const clearSuccessTimeout = useCallback(() => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
  }, []);

  // Démontage : révoque toujours la dernière URL locale connue, annule tout
  // minuteur de remise à zéro en attente.
  useEffect(() => {
    return () => {
      revokePreviewUrl();
      clearSuccessTimeout();
    };
  }, [revokePreviewUrl, clearSuccessTimeout]);

  const resetToIdle = useCallback(() => {
    revokePreviewUrl();
    clearSuccessTimeout();
    idempotencyKeyRef.current = null;
    setAttachment(null);
    setPhase('idle');
    setProgressPercent(null);
    setErrorMessage(null);
  }, [revokePreviewUrl, clearSuccessTimeout]);

  const videoDurationRef = useRef<number | null>(null);

  const applySelection = useCallback(
    (file: File, kind: MediaKind, durationMs: number | null, requestId: number) => {
      if (requestId !== selectionRequestIdRef.current) {
        // Une sélection plus récente a déjà remplacé celle-ci pendant la
        // sonde asynchrone de durée vidéo (ex. double sélection rapide) :
        // jamais appliquer un résultat obsolète.
        return;
      }

      const validation = validateMediaFileForUpload({ mimeType: file.type, sizeBytes: file.size });

      // Remplacement d'une sélection précédente : révoque l'ancienne URL
      // AVANT d'en créer une nouvelle, jamais après (jamais deux URL locales
      // vivantes en même temps pour ce composant).
      revokePreviewUrl();
      clearSuccessTimeout();

      if (!validation.ok) {
        idempotencyKeyRef.current = null;
        setAttachment(null);
        setPhase('error');
        setProgressPercent(null);
        setErrorMessage(validation.error);
        return;
      }

      if (kind === 'video' && durationMs === null) {
        idempotencyKeyRef.current = null;
        setAttachment(null);
        setPhase('error');
        setProgressPercent(null);
        setErrorMessage('Impossible de lire les informations de cette vidéo.');
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      previewUrlRef.current = previewUrl;
      idempotencyKeyRef.current = crypto.randomUUID();
      videoDurationRef.current = durationMs;
      setAttachment({ file, kind, previewUrl });
      setPhase('selected');
      setProgressPercent(null);
      setErrorMessage(null);
    },
    [revokePreviewUrl, clearSuccessTimeout],
  );

  const selectImage = useCallback(
    (file: File) => {
      const requestId = ++selectionRequestIdRef.current;
      applySelection(file, 'image', null, requestId);
    },
    [applySelection],
  );

  const selectVideo = useCallback(
    (file: File) => {
      const requestId = ++selectionRequestIdRef.current;
      setPhase('preparing');
      setErrorMessage(null);

      probeVideoDurationMs(file)
        .then((durationMs) => applySelection(file, 'video', durationMs, requestId))
        .catch(() => applySelection(file, 'video', null, requestId));
    },
    [applySelection],
  );

  const cancel = useCallback(() => {
    if (isSendingRef.current) return;
    resetToIdle();
  }, [resetToIdle]);

  const performSend = useCallback(
    (caption: string) => {
      if (!attachment || isSendingRef.current) return;
      const idempotencyKey = idempotencyKeyRef.current;
      if (!idempotencyKey) return;

      isSendingRef.current = true;
      clearSuccessTimeout();
      setPhase('uploading');
      setProgressPercent(0);
      setErrorMessage(null);

      const { promise } = uploadMediaAttachment(
        conversationId,
        attachment.file,
        caption,
        idempotencyKey,
        attachment.kind === 'video' ? videoDurationRef.current : null,
        (percent) => setProgressPercent(percent),
        () => setPhase('processing'),
      );

      promise
        .then((result) => {
          isSendingRef.current = false;

          if (result.ok) {
            setPhase('success');
            // Appelé depuis ce gestionnaire asynchrone (jamais depuis un
            // `useEffect` réagissant à `phase`) : React recommande de piloter
            // un état externe (ici, le champ texte du composeur parent)
            // directement depuis le callback qui connaît l'événement, pas
            // depuis un effet qui ne ferait que dériver `phase` a posteriori.
            onSendSuccess?.();
            successTimeoutRef.current = setTimeout(() => {
              resetToIdle();
            }, SUCCESS_RESET_DELAY_MS);
            return;
          }

          setPhase('error');
          setProgressPercent(null);
          setErrorMessage(mediaUploadErrorMessage(result.code));
        })
        .catch(() => {
          // Filet de sécurité : `uploadMediaAttachment` ne rejette
          // normalement jamais (voir sa documentation), conservé pour ne
          // jamais laisser le composeur bloqué en silence sur un cas
          // imprévu.
          isSendingRef.current = false;
          setPhase('error');
          setProgressPercent(null);
          setErrorMessage(mediaUploadErrorMessage('unknown_error'));
        });
    },
    [attachment, conversationId, resetToIdle, clearSuccessTimeout, onSendSuccess],
  );

  const send = useCallback((caption: string) => performSend(caption), [performSend]);
  const retry = useCallback((caption: string) => performSend(caption), [performSend]);

  return { attachment, phase, progressPercent, errorMessage, selectImage, selectVideo, cancel, send, retry };
}
