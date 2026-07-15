import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import * as tus from 'tus-js-client';

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from '@/lib/supabase';
import {
  isAllowedImageMimeType,
  isAllowedVideoMimeType,
  validateImageFile,
  validateVideoFile,
  type ImageMimeType,
  type VideoMimeType,
} from '@/types/chat';

export const CHAT_MEDIA_BUCKET = 'chat-media';
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;
const MAX_VIDEO_DURATION_SECONDS = 60;

const MIME_EXTENSIONS: Record<ImageMimeType | VideoMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
};

export type PickedImage = {
  uri: string;
  mimeType: ImageMimeType;
  /** Peut être `null` : certaines plateformes ne renseignent pas fileSize sur l'asset choisi. */
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
};

export type PickedVideo = {
  uri: string;
  mimeType: VideoMimeType;
  /** Peut être `null` sur certains appareils (surtout Android) : revalidé avec la taille réelle avant upload. */
  sizeBytes: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
};

export type PickedMedia = { kind: 'image'; data: PickedImage } | { kind: 'video'; data: PickedVideo };

/**
 * UUID v4. Pas besoin d'aléa cryptographique ici : le chemin de stockage est
 * protégé par les policies RLS Storage (accès réservé aux participants de la
 * conversation), pas par le secret du nom de fichier.
 */
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Chemin obligatoire conversation_id/uploader_id/uuid.extension (imposé aussi côté policies Storage), jamais le nom original ni écrasé. */
export function generateStoragePath(
  conversationId: string,
  uploaderId: string,
  mimeType: ImageMimeType | VideoMimeType,
): string {
  return `${conversationId}/${uploaderId}/${uuidv4()}.${MIME_EXTENSIONS[mimeType]}`;
}

/**
 * Ouvre le sélecteur de photos de la bibliothèque (jamais la caméra, jamais
 * le micro). Retourne `null` si l'utilisateur annule la sélection.
 */
export async function pickImageFromLibrary(): Promise<PickedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Accès à tes photos refusé. Autorise l’accès dans les réglages pour envoyer une image.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  if (!isAllowedImageMimeType(asset.mimeType)) {
    throw new Error('Format d’image non pris en charge. Utilise JPEG, PNG ou WebP.');
  }

  return {
    uri: asset.uri,
    mimeType: asset.mimeType,
    sizeBytes: asset.fileSize ?? null,
    width: asset.width ?? null,
    height: asset.height ?? null,
  };
}

/**
 * `expo-image-picker` rapporte `duration` en millisecondes sur natif
 * (Android/iOS, documenté), mais en SECONDES sur web — bug amont :
 * `ExponentImagePicker.web.ts` lit directement `HTMLVideoElement.duration`
 * sans le convertir. Sans cette normalisation, un flottant en secondes
 * (ex. `2.032467`) serait envoyé tel quel à `create_video_message`, dont le
 * paramètre `p_duration_ms` est un entier côté Postgres : rejet SQL brut,
 * jamais un message français. Normalisé une bonne fois ici, au point
 * d'entrée : le reste de l'app peut toujours supposer des millisecondes
 * entières.
 */
function normalizeDurationMs(rawDuration: number | null | undefined): number | null {
  if (rawDuration == null || !Number.isFinite(rawDuration)) return null;
  const ms = Platform.OS === 'web' ? rawDuration * 1000 : rawDuration;
  return Math.round(ms);
}

/**
 * Ouvre le sélecteur de vidéos de la bibliothèque (jamais la caméra, jamais
 * le micro, une seule vidéo). Retourne `null` si l'utilisateur annule.
 * `videoMaxDuration` est un garde-fou côté sélecteur natif ; la validation
 * faisant foi reste `validateVideoFile`, appliquée avant l'upload avec la
 * taille réelle du fichier.
 */
export async function pickVideoFromLibrary(): Promise<PickedVideo | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Accès à tes vidéos refusé. Autorise l’accès dans les réglages pour envoyer une vidéo.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    videoMaxDuration: MAX_VIDEO_DURATION_SECONDS,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  if (!isAllowedVideoMimeType(asset.mimeType)) {
    throw new Error('Format vidéo non pris en charge. Utilise MP4.');
  }

  return {
    uri: asset.uri,
    mimeType: asset.mimeType,
    sizeBytes: asset.fileSize ?? null,
    durationMs: normalizeDurationMs(asset.duration),
    width: asset.width ?? null,
    height: asset.height ?? null,
  };
}

/**
 * Sur Android, le système peut détruire l'activité pendant que le sélecteur
 * est ouvert (ex. « Ne pas conserver les activités » dans les options
 * développeur) : le résultat de l'appel `launchImageLibraryAsync` d'origine
 * est alors perdu (nouveau contexte JS après recréation), mais reste
 * récupérable via `getPendingResultAsync`. À appeler une fois au montage de
 * l'écran de conversation.
 */
export async function recoverPendingMediaPick(): Promise<PickedMedia | null> {
  const pending = await ImagePicker.getPendingResultAsync();

  if (!pending || !('canceled' in pending) || pending.canceled || !pending.assets || pending.assets.length === 0) {
    return null;
  }

  const asset = pending.assets[0];

  if (asset.type === 'video' && isAllowedVideoMimeType(asset.mimeType)) {
    return {
      kind: 'video',
      data: {
        uri: asset.uri,
        mimeType: asset.mimeType,
        sizeBytes: asset.fileSize ?? null,
        durationMs: normalizeDurationMs(asset.duration),
        width: asset.width ?? null,
        height: asset.height ?? null,
      },
    };
  }

  if (asset.type === 'image' && isAllowedImageMimeType(asset.mimeType)) {
    return {
      kind: 'image',
      data: {
        uri: asset.uri,
        mimeType: asset.mimeType,
        sizeBytes: asset.fileSize ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
      },
    };
  }

  return null;
}

/**
 * Upload une image déjà sélectionnée vers le bucket privé `chat-media`, sous
 * un chemin `conversation_id/uploader_id/uuid.extension` généré ici (jamais
 * le nom original du fichier, jamais le chemin local du téléphone).
 */
export async function uploadAttachment(
  conversationId: string,
  uploaderId: string,
  picked: PickedImage,
): Promise<{ storagePath: string; sizeBytes: number }> {
  const response = await fetch(picked.uri);
  const arrayBuffer = await response.arrayBuffer();
  const sizeBytes = arrayBuffer.byteLength;

  const validation = validateImageFile({ mimeType: picked.mimeType, sizeBytes });
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const storagePath = generateStoragePath(conversationId, uploaderId, picked.mimeType);

  const { error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(storagePath, arrayBuffer, {
    contentType: picked.mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error("Impossible d'envoyer l'image pour le moment.");
  }

  return { storagePath, sizeBytes };
}

/** Nettoyage best-effort : supprime un fichier Storage orphelin (échec silencieux, ne doit jamais masquer l'erreur d'origine). */
export async function removeAttachmentFile(storagePath: string): Promise<void> {
  try {
    await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([storagePath]);
  } catch {
    // Best-effort : un fichier orphelin résiduel n'est pas une fuite de
    // sécurité (RLS Storage continue de le protéger), seulement du gaspillage
    // de stockage à nettoyer plus tard si besoin.
  }
}

/**
 * URL signée temporaire pour afficher un média privé (image ou vidéo). Ne
 * jamais persister la valeur retournée : elle doit être redemandée à
 * l'expiration.
 */
export async function getSignedAttachmentUrl(
  storagePath: string,
  expiresInSeconds: number = DEFAULT_SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error("Impossible de charger l'image pour le moment.");
  }

  return data.signedUrl;
}

/** Session courante, exclusivement pour authentifier l'upload TUS — jamais journalisée. */
async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Session expirée. Reconnecte-toi.');
  }
  return data.session.access_token;
}

function buildResumableUploadEndpoint(): string {
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
}

/** Signale une annulation volontaire de l'upload en cours, distincte d'une véritable erreur réseau. */
export class VideoUploadCancelledError extends Error {
  constructor() {
    super('Envoi de la vidéo annulé.');
    this.name = 'VideoUploadCancelledError';
  }
}

export type VideoUploadHandle = {
  /** Résout `{ storagePath, sizeBytes }` au succès ; rejette avec `VideoUploadCancelledError` si `cancel()` est appelé, ou une erreur française sinon. */
  promise: Promise<{ storagePath: string; sizeBytes: number }>;
  cancel: () => void;
};

/**
 * Upload reprenable (protocole TUS) d'une vidéo déjà sélectionnée et
 * validée vers `chat-media`. À la différence des photos (upload direct), les
 * vidéos peuvent être volumineuses : la progression, les délais de nouvelle
 * tentative après coupure réseau et l'annulation sont gérés par
 * `tus-js-client`. Le jeton de session sert uniquement d'en-tête
 * d'authentification, jamais journalisé (aucun `console.log` des options
 * d'upload ni des erreurs brutes de la bibliothèque TUS).
 */
export function uploadVideoResumable(
  conversationId: string,
  uploaderId: string,
  picked: PickedVideo,
  blob: Blob,
  onProgress?: (percent: number) => void,
): VideoUploadHandle {
  const validation = validateVideoFile({
    mimeType: picked.mimeType,
    sizeBytes: blob.size,
    durationMs: picked.durationMs,
  });

  const storagePath = generateStoragePath(conversationId, uploaderId, picked.mimeType);
  let uploadInstance: tus.Upload | null = null;
  let rejectPromise: ((reason: unknown) => void) | null = null;
  let cancelled = false;

  const promise = new Promise<{ storagePath: string; sizeBytes: number }>((resolve, reject) => {
    rejectPromise = reject;

    if (!validation.ok) {
      reject(new Error(validation.error));
      return;
    }

    getAccessToken()
      .then((accessToken) => {
        if (cancelled) return;

        uploadInstance = new tus.Upload(blob, {
          endpoint: buildResumableUploadEndpoint(),
          retryDelays: [0, 3000, 5000, 10000, 20000],
          chunkSize: 6 * 1024 * 1024,
          removeFingerprintOnSuccess: true,
          headers: {
            authorization: `Bearer ${accessToken}`,
            apikey: SUPABASE_PUBLISHABLE_KEY,
            'x-upsert': 'false',
          },
          metadata: {
            bucketName: CHAT_MEDIA_BUCKET,
            objectName: storagePath,
            contentType: picked.mimeType,
          },
          onError: () => {
            // Erreur générique volontaire : ne jamais exposer le détail brut
            // de tus-js-client (peut référencer la requête/réponse HTTP).
            reject(new Error("Impossible d'envoyer la vidéo pour le moment."));
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            onProgress?.(Math.round((bytesUploaded / bytesTotal) * 100));
          },
          onSuccess: () => {
            resolve({ storagePath, sizeBytes: blob.size });
          },
        });
        uploadInstance.start();
      })
      .catch((err) => {
        reject(err instanceof Error ? err : new Error("Impossible d'envoyer la vidéo pour le moment."));
      });
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      uploadInstance?.abort(true);
      rejectPromise?.(new VideoUploadCancelledError());
    },
  };
}
