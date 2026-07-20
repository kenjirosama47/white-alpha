import type { MediaKind } from './media-config';

/**
 * Client d'upload média (Phase 8.5.3) — appelle la route serveur `POST
 * /conversations/[id]/media` (Phase 8.5.2), seule autorité de sécurité :
 * ce module ne fait que transporter le fichier déjà validé côté client
 * (confort UX, `media-client-validation.ts`) et interpréter la réponse
 * générique de la route, jamais une nouvelle décision de sécurité.
 */

export type MediaUploadErrorCode = 'invalid_request' | 'invalid_file' | 'unauthorized' | 'upload_failed' | 'send_failed';

export type MediaUploadSuccessResult = {
  ok: true;
  message: {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    messageType: MediaKind;
    createdAt: string;
  };
};

/** `network_error`/`invalid_response` : ajoutés côté client (jamais renvoyés par la route elle-même), pour les échecs qui n'atteignent jamais le serveur ou dont la réponse est illisible. */
export type MediaUploadErrorResult = { ok: false; code: MediaUploadErrorCode | 'network_error' | 'invalid_response' };

export type MediaUploadResult = MediaUploadSuccessResult | MediaUploadErrorResult;

const MEDIA_UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  invalid_file: 'Ce fichier ne peut pas être envoyé.',
  unauthorized: "Vous n'êtes pas autorisé à envoyer ce média.",
  upload_failed: "Impossible d'envoyer le média pour le moment.",
  send_failed: "Impossible d'envoyer le média pour le moment.",
  invalid_request: "Impossible d'envoyer le média pour le moment.",
  network_error: "Impossible d'envoyer le média pour le moment.",
  invalid_response: "Impossible d'envoyer le média pour le moment.",
};

const DEFAULT_MEDIA_UPLOAD_ERROR_MESSAGE = "Impossible d'envoyer le média pour le moment.";

/** Toujours un message générique en français — jamais le détail brut d'une erreur serveur (déjà garanti par la route elle-même, ce mapping ne fait qu'ajouter les cas purement client : réseau, réponse illisible). */
export function mediaUploadErrorMessage(code: string): string {
  return MEDIA_UPLOAD_ERROR_MESSAGES[code] ?? DEFAULT_MEDIA_UPLOAD_ERROR_MESSAGE;
}

/**
 * Durée réelle d'une vidéo (millisecondes), lue localement via un élément
 * `<video>` détaché (jamais ajouté au DOM) — pure métadonnée UX, jamais une
 * preuve de sécurité : `create_video_message` revalide indépendamment cette
 * valeur (1-60000 ms). L'URL locale utilisée pour la sonde est toujours
 * révoquée avant la résolution/le rejet de cette fonction, qu'elle réussisse
 * ou échoue.
 */
export function probeVideoDurationMs(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    function cleanup() {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
      URL.revokeObjectURL(objectUrl);
    }

    function onLoaded() {
      const durationMs = Math.round(video.duration * 1000);
      cleanup();
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        reject(new Error('invalid_duration'));
        return;
      }
      resolve(durationMs);
    }

    function onError() {
      cleanup();
      reject(new Error('invalid_duration'));
    }

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);
    video.src = objectUrl;
  });
}

export type MediaUploadHandle = {
  /** Résout toujours (jamais de rejet) : les échecs réseau/parsing sont représentés comme `{ ok: false, code: 'network_error' | 'invalid_response' }`, jamais une exception à gérer séparément par l'appelant. */
  promise: Promise<MediaUploadResult>;
  xhr: XMLHttpRequest;
};

/**
 * Upload d'une pièce jointe déjà validée côté client vers la route Phase
 * 8.5.2, via `XMLHttpRequest` (seule API exposant la progression d'upload
 * réelle dans un navigateur — `fetch` ne le fait pas). Ne simule jamais une
 * progression : `onProgress` n'est appelé que lorsque `event.lengthComputable`
 * est vrai (donnée fournie par le navigateur), jamais une valeur inventée.
 * `onRequestBodySent` signale la fin de l'envoi des octets (transition vers
 * l'état "traitement serveur", avant que la réponse n'arrive).
 */
export function uploadMediaAttachment(
  conversationId: string,
  file: File,
  caption: string,
  idempotencyKey: string,
  durationMs: number | null,
  onProgress: (percent: number) => void,
  onRequestBodySent: () => void,
): MediaUploadHandle {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.set('file', file);
  formData.set('caption', caption);
  if (durationMs !== null) {
    formData.set('durationMs', String(durationMs));
  }

  const promise = new Promise<MediaUploadResult>((resolve) => {
    xhr.open('POST', `/conversations/${conversationId}/media`);
    xhr.setRequestHeader('Idempotency-Key', idempotencyKey);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.upload.onload = () => {
      onProgress(100);
      onRequestBodySent();
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as MediaUploadResult;
        resolve(body);
      } catch {
        resolve({ ok: false, code: 'invalid_response' });
      }
    };
    xhr.onerror = () => resolve({ ok: false, code: 'network_error' });

    xhr.send(formData);
  });

  return { promise, xhr };
}
