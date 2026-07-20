'use client';

import type { AttachmentSendPhase, SelectedAttachment } from './useAttachmentUpload';
import styles from './AttachmentPreview.module.css';

type AttachmentPreviewProps = {
  attachment: SelectedAttachment;
  phase: AttachmentSendPhase;
  progressPercent: number | null;
  errorMessage: string | null;
  onCancel: () => void;
  onRetry: () => void;
};

const PHASE_STATUS_LABEL: Partial<Record<AttachmentSendPhase, string>> = {
  preparing: 'Préparation…',
  processing: 'Traitement en cours…',
  success: 'Envoyé',
};

/**
 * Aperçu local d'une pièce jointe avant envoi (Phase 8.5.3) — image
 * (miniature) ou vidéo (lecteur natif `<video controls>`), toujours depuis
 * `attachment.previewUrl` (`URL.createObjectURL`, jamais une URL signée :
 * l'affichage réel des médias envoyés est Phase 8.5.4, hors périmètre ici).
 * Ce composant ne gère jamais lui-même le cycle de vie de l'URL locale
 * (création/révocation) : entièrement porté par `useAttachmentUpload`.
 */
export function AttachmentPreview({ attachment, phase, progressPercent, errorMessage, onCancel, onRetry }: AttachmentPreviewProps) {
  const isBusy = phase === 'preparing' || phase === 'uploading' || phase === 'processing';
  const statusLabel = errorMessage ? null : PHASE_STATUS_LABEL[phase];

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        {attachment.kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL locale éphémère (blob:), jamais un cas d'usage pour next/image (optimisation distante).
          <img src={attachment.previewUrl} alt="" className={styles.thumbnail} />
        ) : (
          <video src={attachment.previewUrl} controls className={styles.videoPreview} />
        )}

        <div className={styles.info}>
          {errorMessage && (
            <p role="alert" className={styles.error}>
              {errorMessage}
            </p>
          )}
          {statusLabel && <p className={styles.status}>{statusLabel}</p>}

          <div className={styles.actions}>
            <button type="button" onClick={onCancel} disabled={isBusy} className={styles.cancelButton}>
              Annuler
            </button>
            {phase === 'error' && (
              <button type="button" onClick={onRetry} className={styles.retryButton}>
                Réessayer
              </button>
            )}
          </div>
        </div>
      </div>

      {phase === 'uploading' && progressPercent !== null && (
        <div className={styles.progressWrapper}>
          <div
            role="progressbar"
            aria-label="Progression de l'envoi"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
          <span className={styles.progressLabel}>{progressPercent}%</span>
        </div>
      )}

      {phase === 'processing' && (
        // Indéterminé (aucun `aria-valuenow`) : le navigateur n'a plus
        // d'information fiable une fois l'envoi terminé et la réponse
        // serveur pas encore arrivée — jamais un pourcentage inventé.
        <div
          role="progressbar"
          aria-label="Traitement en cours"
          aria-valuemin={0}
          aria-valuemax={100}
          className={styles.progressTrack}>
          <div className={styles.progressFillIndeterminate} />
        </div>
      )}
    </div>
  );
}
