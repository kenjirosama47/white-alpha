'use client';

import { useState } from 'react';

import { useSignedAttachmentUrl } from './useSignedAttachmentUrl';
import styles from './MessageImage.module.css';

type MessageImageProps = {
  attachmentId: string;
  width: number | null;
  height: number | null;
};

const FALLBACK_ASPECT_RATIO = 4 / 3;

/**
 * Image d'une pièce jointe dans une bulle de message (Phase 8.5.4) : URL
 * signée résolue via `useSignedAttachmentUrl` (jamais un `storagePath`
 * connu du client), chargement différé (`loading="lazy"`), dimensions
 * réservées (`aspect-ratio`, aucun saut de mise en page une fois l'image
 * chargée), état d'erreur avec réessai.
 */
export function MessageImage({ attachmentId, width, height }: MessageImageProps) {
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
        <p className={styles.statusText}>Image indisponible.</p>
        <button type="button" onClick={retry} className={styles.retryButton}>
          Réessayer
        </button>
      </div>
    );
  }

  if (isLoading || !url) {
    return (
      <div className={styles.placeholder} style={{ aspectRatio }} role="status" aria-label="Chargement de l'image">
        <span className={styles.spinner} aria-hidden="true" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL signée temporaire et expirable (Supabase Storage), jamais un cas d'usage pour next/image (optimisation d'images distantes stables).
    <img
      src={url}
      alt="Photo envoyée dans la conversation"
      loading="lazy"
      style={{ aspectRatio }}
      className={styles.image}
      onError={() => setLoadFailed(true)}
    />
  );
}
