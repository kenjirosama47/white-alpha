/**
 * Constantes de la photo personnelle locale (Phase 10.5a — voir PLAN.md).
 * Aucune de ces valeurs ne concerne Supabase : tout le flux reste local à
 * l'appareil (choix, recadrage, compression, stockage).
 */

/** Nom du sous-dossier privé de l'application (répertoire documents, jamais un dossier public/partagé). */
export const PERSONAL_PHOTOS_DIRNAME = 'appearance-photos';

/**
 * Dimensions cibles après recadrage/compression : ratio portrait 9:16
 * (identique au ratio des fonds du catalogue, Phase 10.4), plus grand que
 * les 360×640 des décorations prédéfinies car il s'agit d'une vraie photo
 * de l'utilisateur, potentiellement affichée en plein écran.
 */
export const PERSONAL_PHOTO_TARGET_WIDTH = 720;
export const PERSONAL_PHOTO_TARGET_HEIGHT = 1280;

/** Qualité de compression finale (0–1) — compromis netteté/poids, jamais 1 (aucune compression) ni une valeur illisible. */
export const PERSONAL_PHOTO_COMPRESSION_QUALITY = 0.75;
