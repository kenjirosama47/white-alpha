import { isAllowedMimeType, maxSizeForMimeType } from './media-config';

export type ClientMediaValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validation côté client (Phase 8.5.1) : confort UX uniquement (retour
 * immédiat avant upload, évite un aller-retour réseau pour un cas déjà
 * détectable localement) — **jamais l'autorité de sécurité**. Repose
 * uniquement sur le type MIME déclaré par le navigateur (`File.type`) et la
 * taille déclarée, ni l'un ni l'autre vérifiés ici par le contenu réel. Seule
 * `media-server-validation.ts` (magic bytes, taille réelle mesurée côté
 * serveur) fait foi ; un client malveillant qui contournerait entièrement ce
 * fichier serait quand même bloqué côté serveur.
 */
export function validateMediaFileForUpload(input: { mimeType: string | null | undefined; sizeBytes: number }): ClientMediaValidationResult {
  if (!isAllowedMimeType(input.mimeType)) {
    return { ok: false, error: 'Format de fichier non pris en charge. Utilise JPEG, PNG, WebP, MP4 ou WebM.' };
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: 'Fichier invalide.' };
  }

  const maxSizeBytes = maxSizeForMimeType(input.mimeType);
  if (input.sizeBytes > maxSizeBytes) {
    const maxSizeMb = Math.round(maxSizeBytes / (1024 * 1024));
    return { ok: false, error: `Le fichier ne doit pas dépasser ${maxSizeMb} Mo.` };
  }

  return { ok: true };
}
