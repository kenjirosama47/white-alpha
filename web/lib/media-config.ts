/**
 * Configuration centralisée des pièces jointes Web (Phase 8.5.1) — seule
 * source de vérité pour les types, tailles et signatures autorisés, partagée
 * entre la validation client (confort UX, `media-client-validation.ts`) et la
 * validation serveur (seule autorité, `media-server-validation.ts`). Fichier
 * pur (aucune dépendance `next/headers`/navigateur) : importable des deux
 * côtés sans risque de fuite dans le mauvais bundle.
 *
 * Vidéo : MP4 et WebM (au-delà du seul MP4 du modèle mobile actuel — voir la
 * note de migration Phase 8.5.2 dans le rapport de sous-phase : la contrainte
 * `message_attachments_mime_type_check` en base n'autorise aujourd'hui que
 * `video/mp4`, une migration sera nécessaire avant que WebM puisse
 * effectivement être inséré, même si la validation applicative l'accepte
 * déjà ici).
 */

export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';
export type VideoMimeType = 'video/mp4' | 'video/webm';
export type AllowedMimeType = ImageMimeType | VideoMimeType;
export type MediaKind = 'image' | 'video';

export const ALLOWED_IMAGE_MIME_TYPES: readonly ImageMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_VIDEO_MIME_TYPES: readonly VideoMimeType[] = ['video/mp4', 'video/webm'];
export const ALLOWED_MIME_TYPES: readonly AllowedMimeType[] = [...ALLOWED_IMAGE_MIME_TYPES, ...ALLOWED_VIDEO_MIME_TYPES];

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 Mo
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50 Mo

/** Une seule pièce jointe par message pour cette première version (Phase 8.5.1) — pas encore appliqué techniquement ici, aucune route/UI d'upload n'existe dans cette sous-phase ; sert de référence aux sous-phases suivantes. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 1;

export function mediaKindForMimeType(mimeType: string): MediaKind | null {
  if ((ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return 'image';
  if ((ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType)) return 'video';
  return null;
}

export function isAllowedMimeType(mimeType: string | null | undefined): mimeType is AllowedMimeType {
  return !!mimeType && (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function maxSizeForMimeType(mimeType: AllowedMimeType): number {
  return mediaKindForMimeType(mimeType) === 'video' ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
}

/** Extensions autorisées par type MIME — dérivées du MIME déclaré, jamais du nom de fichier original (voir `media-server-validation.ts` : le nom original sert uniquement à cette vérification de cohérence, jamais comme chemin de stockage). */
export const ALLOWED_EXTENSIONS: Record<AllowedMimeType, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
};

type MagicByteSignature = { offset: number; bytes: readonly number[] };

/**
 * Signatures binaires réelles (magic bytes) par type MIME autorisé — jamais
 * dérivées d'une bibliothèque tierce, pour garder un contrôle total et
 * auditable de ce qui est accepté. Une signature à plusieurs segments (WebP :
 * `RIFF` en tête, `WEBP` à l'octet 8) doit correspondre entièrement.
 * Références : JPEG (SOI marker), PNG (signature officielle 8 octets),
 * WebP/RIFF (container RIFF + FourCC WEBP), MP4/ISOBMFF (box `ftyp` à
 * l'octet 4, universel à tous les variants MP4/QuickTime), WebM/Matroska
 * (en-tête EBML global, identique pour WebM et Matroska).
 */
export const MEDIA_MAGIC_BYTES: Record<AllowedMimeType, readonly MagicByteSignature[]> = {
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  'image/webp': [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
    { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  ],
  'video/mp4': [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }],
  'video/webm': [{ offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }],
};

/**
 * Nombre d'octets d'en-tête nécessaires pour vérifier la signature la plus
 * exigeante (WebP : octet 8 + 4 octets = 12, marge incluse). La validation
 * serveur ne lit jamais plus que ces quelques octets pour la vérification de
 * signature — y compris pour une vidéo de 50 Mo, jamais le fichier entier en
 * mémoire pour ce contrôle (voir `media-server-validation.ts`).
 */
export const MEDIA_HEADER_BYTES_REQUIRED = 16;
