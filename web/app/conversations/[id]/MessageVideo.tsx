'use client';

import { useState } from 'react';

import { useSignedAttachmentUrl } from './useSignedAttachmentUrl';
import styles from './MessageVideo.module.css';

type MessageVideoProps = {
  attachmentId: string;
  width: number | null;
  height: number | null;
};

const FALLBACK_ASPECT_RATIO = 16 / 9;

/**
 * Vidéo d'une pièce jointe dans une bulle de message (Phase 8.5.4) : URL
 * signée résolue via `useSignedAttachmentUrl`, contrôles natifs,
 * `preload="metadata"` (aucun téléchargement automatique complet, aucune
 * lecture automatique), dimensions réservées, état d'erreur avec réessai.
 */
export function MessageVideo({ attachmentId, width, height }: MessageVideoProps) {
  const { url, isLoading, error, refresh } = useSignedAttachmentUrl(attachmentId);
  const [loadFailed, setLoadFailed] = useState(false);
  const aspectRatio = width && height ? width / height : FALLBACK_ASPECT_RATIO;

  function retry() {
    setLoadFailed(false);
    refresh();
  }

  if (error || loadFailed) {
    return (
      <div className={styles.placeholder} style={{ aspectRatio }}>
        <p className={styles.statusText}>Vidéo indisponible.</p>
        <button type="button" onClick={retry} className={styles.retryButton}>
          Réessayer
        </button>
      </div>
    );
  }

  if (isLoading || !url) {
    return (
      <div className={styles.placeholder} style={{ aspectRatio }} role="status" aria-label="Chargement de la vidéo">
        <span className={styles.spinner} aria-hidden="true" />
      </div>
    );
  }

  return (
    <video
      src={url}
      controls
      preload="metadata"
      style={{ aspectRatio }}
      className={styles.video}
      onError={() => setLoadFailed(true)}
    />
  );
}
