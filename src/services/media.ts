import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';
import { isAllowedImageMimeType, validateImageFile, type ImageMimeType } from '@/types/chat';

export const CHAT_MEDIA_BUCKET = 'chat-media';
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;

const MIME_EXTENSIONS: Record<ImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type PickedImage = {
  uri: string;
  mimeType: ImageMimeType;
  /** Peut être `null` : certaines plateformes ne renseignent pas fileSize sur l'asset choisi. */
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
};

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

/** Chemin obligatoire conversation_id/uploader_id/uuid.extension (imposé aussi côté policies Storage). */
export function generateStoragePath(conversationId: string, uploaderId: string, mimeType: ImageMimeType): string {
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
 * URL signée temporaire pour afficher une image privée. Ne jamais persister
 * la valeur retournée : elle doit être redemandée à l'expiration.
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
