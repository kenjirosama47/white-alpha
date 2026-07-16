import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';
import { isAllowedImageMimeType, validateAvatarFile, type ImageMimeType } from '@/types/chat';

/**
 * Bucket dédié, distinct de `chat-media` (voir migration
 * 20260716140000_profile_settings.sql pour la justification du choix
 * public) : ne jamais mélanger avatars et pièces jointes de conversation.
 */
export const AVATAR_BUCKET = 'avatars';

const MIME_EXTENSIONS: Record<ImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Même approche que generateStoragePath dans services/media.ts, non réutilisée ici pour garder les deux domaines indépendants (voir consigne "ne mélange pas"). */
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Chemin obligatoire user_id/uuid.extension (imposé aussi côté policies Storage) : jamais le nom original, jamais réutilisé. */
export function generateAvatarPath(userId: string, mimeType: ImageMimeType): string {
  return `${userId}/${uuidv4()}.${MIME_EXTENSIONS[mimeType]}`;
}

export type PickedAvatar = {
  uri: string;
  mimeType: ImageMimeType;
  /** Peut être `null` : certaines plateformes ne renseignent pas fileSize sur l'asset choisi. */
  sizeBytes: number | null;
};

/**
 * Ouvre le sélecteur de photos de la bibliothèque (jamais la caméra, jamais
 * le micro), avec recadrage carré natif (`allowsEditing`/`aspect: [1,1]`,
 * disponible nativement dans expo-image-picker, aucune dépendance
 * supplémentaire). Retourne `null` si l'utilisateur annule.
 */
export async function pickAvatarFromLibrary(): Promise<PickedAvatar | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Accès à tes photos refusé. Autorise l’accès dans les réglages pour changer ta photo de profil.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
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
  };
}

/** Upload un avatar déjà sélectionné vers le bucket `avatars`, sous un chemin `user_id/uuid.extension` généré ici. */
export async function uploadAvatar(userId: string, picked: PickedAvatar): Promise<{ storagePath: string }> {
  const response = await fetch(picked.uri);
  const arrayBuffer = await response.arrayBuffer();
  const sizeBytes = arrayBuffer.byteLength;

  const validation = validateAvatarFile({ mimeType: picked.mimeType, sizeBytes });
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const storagePath = generateAvatarPath(userId, picked.mimeType);

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(storagePath, arrayBuffer, {
    contentType: picked.mimeType,
    upsert: false,
  });

  if (error) {
    throw new Error("Impossible d'envoyer la photo de profil pour le moment.");
  }

  return { storagePath };
}

/**
 * URL publique stable (bucket public, voir migration) : aucun appel réseau,
 * jamais de signature/expiration, ne jamais persister ce résultat en base
 * (seul le chemin l'est) même si le recalculer à chaque affichage est
 * pratiquement gratuit.
 */
export function getAvatarPublicUrl(storagePath: string): string {
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

/**
 * Nettoyage best-effort (même politique que `removeAttachmentFile` dans
 * services/media.ts) : utilisé à la fois pour supprimer l'ancien avatar
 * après une mise à jour réussie, et pour supprimer le nouveau fichier en
 * compensation si la RPC échoue après un upload réussi. Un échec silencieux
 * ici n'est jamais une fuite de sécurité (les policies Storage protègent
 * toujours le fichier), seulement du stockage résiduel à nettoyer plus tard.
 */
export async function removeAvatarFile(storagePath: string): Promise<void> {
  try {
    await supabase.storage.from(AVATAR_BUCKET).remove([storagePath]);
  } catch {
    // Best-effort, volontairement silencieux.
  }
}
