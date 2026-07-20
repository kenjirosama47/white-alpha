import {
  ALLOWED_EXTENSIONS,
  MEDIA_HEADER_BYTES_REQUIRED,
  MEDIA_MAGIC_BYTES,
  isAllowedMimeType,
  maxSizeForMimeType,
  mediaKindForMimeType,
  type AllowedMimeType,
  type MediaKind,
} from './media-config';

export type MediaValidationErrorCode =
  | 'type_not_allowed'
  | 'file_too_large'
  | 'content_mismatch'
  | 'empty_or_corrupt'
  | 'unsafe_filename'
  | 'unknown_error';

export type MediaValidationError = { ok: false; code: MediaValidationErrorCode; error: string };
export type MediaValidationSuccess = { ok: true; mediaType: MediaKind; mimeType: AllowedMimeType };
export type MediaValidationResult = MediaValidationSuccess | MediaValidationError;

export type ServerMediaFileInput = {
  /** Type MIME déclaré par le client (`FormData`/en-tête) — jamais l'autorité seule, revérifié contre `header` ci-dessous. */
  declaredMimeType: string | null;
  /**
   * Nom original du fichier tel qu'envoyé par le client — **jamais utilisé
   * comme chemin de stockage** (Phase 8.5.2 : chemin généré côté serveur à
   * partir d'un UUID, indépendant de ce nom). Utilisé exclusivement ici pour
   * la validation (extension déclarée, caractères dangereux) ; absent du
   * type de retour, jamais journalisé ni renvoyé au client.
   */
  originalFilename: string | null;
  /** Taille réelle mesurée côté serveur (ex. compteur d'octets pendant la réception du flux, Phase 8.5.2) — jamais une taille déclarée par le client sans vérification. */
  sizeBytes: number;
  /**
   * Premiers octets du fichier uniquement (voir `MEDIA_HEADER_BYTES_REQUIRED`)
   * — jamais le fichier entier, y compris pour une vidéo de 50 Mo : cette
   * fonction ne lit jamais au-delà des `MEDIA_HEADER_BYTES_REQUIRED`
   * premiers octets de ce tableau, quelle que soit sa longueur réelle.
   */
  header: Uint8Array;
};

function extractLastExtension(filename: string): string | null {
  const trimmed = filename.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot < 0 || lastDot === trimmed.length - 1) return null;
  return trimmed.slice(lastDot + 1).toLowerCase();
}

const MAX_CONTROL_CHAR_CODE = 31; // U+0000 à U+001F
const DEL_CHAR_CODE = 127; // U+007F

/**
 * Rejette tout nom contenant une traversée de chemin (`..`), un séparateur de
 * répertoire ou un caractère de contrôle (comparaison directe par code point,
 * pas de classe de caractères regex, pour éviter toute ambiguïté d'échappement).
 * Le nom original n'étant jamais utilisé comme chemin de stockage (voir
 * `ServerMediaFileInput.originalFilename` ci-dessus), cette vérification ne
 * protège pas un chemin de fichier réel — elle empêche seulement qu'un nom
 * malveillant soit accepté puis potentiellement journalisé/affiché tel quel
 * ailleurs dans l'application.
 */
function hasUnsafeFilenameCharacters(filename: string): boolean {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return true;
  }
  for (let i = 0; i < filename.length; i += 1) {
    const code = filename.charCodeAt(i);
    if (code <= MAX_CONTROL_CHAR_CODE || code === DEL_CHAR_CODE) {
      return true;
    }
  }
  return false;
}

function matchesMagicBytes(header: Uint8Array, mimeType: AllowedMimeType): boolean {
  const signatures = MEDIA_MAGIC_BYTES[mimeType];
  return signatures.every(({ offset, bytes }) => {
    if (header.length < offset + bytes.length) return false;
    return bytes.every((byte, index) => header[offset + index] === byte);
  });
}

/** Détecte le type MIME réel à partir des seuls octets d'en-tête fournis, indépendamment de ce que déclare le client — `null` si aucune signature connue ne correspond. */
function detectMimeTypeFromMagicBytes(header: Uint8Array): AllowedMimeType | null {
  const candidates = Object.keys(MEDIA_MAGIC_BYTES) as AllowedMimeType[];
  return candidates.find((mimeType) => matchesMagicBytes(header, mimeType)) ?? null;
}

const GENERIC_ERROR = 'Impossible de traiter ce fichier pour le moment.';

/**
 * Validation serveur (Phase 8.5.1) — **seule autorité de sécurité**, jamais
 * remplacée par `media-client-validation.ts`. Ordre des vérifications,
 * chacune pouvant rejeter indépendamment des autres :
 * 1. nom de fichier sûr (aucune traversée, séparateur ou caractère de contrôle) ;
 * 2. type MIME déclaré dans l'allowlist ;
 * 3. taille réelle non nulle et sous le plafond du type déclaré ;
 * 4. extension déclarée cohérente avec le type MIME déclaré ;
 * 5. signature réelle (magic bytes) cohérente avec le type MIME déclaré —
 *    seuls les `MEDIA_HEADER_BYTES_REQUIRED` premiers octets sont lus, jamais
 *    le fichier entier.
 * Les étapes 4+5 garantissent ensemble la cohérence à trois : extension ↔
 * MIME déclaré ↔ contenu réel (chaque extension n'est associée qu'à un seul
 * type MIME dans `ALLOWED_EXTENSIONS`, donc extension et contenu concordent
 * transitivement dès lors que les deux concordent individuellement avec le
 * MIME déclaré).
 */
export function validateMediaFileOnServer(input: ServerMediaFileInput): MediaValidationResult {
  try {
    const originalFilename = input.originalFilename ?? '';

    if (hasUnsafeFilenameCharacters(originalFilename)) {
      return { ok: false, code: 'unsafe_filename', error: 'Nom de fichier invalide.' };
    }

    if (!isAllowedMimeType(input.declaredMimeType)) {
      return { ok: false, code: 'type_not_allowed', error: 'Type de fichier non autorisé.' };
    }
    const declaredMimeType = input.declaredMimeType;

    if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
      return { ok: false, code: 'empty_or_corrupt', error: 'Fichier vide ou corrompu.' };
    }

    const maxSizeBytes = maxSizeForMimeType(declaredMimeType);
    if (input.sizeBytes > maxSizeBytes) {
      return { ok: false, code: 'file_too_large', error: 'Fichier trop volumineux.' };
    }

    const extension = extractLastExtension(originalFilename);
    const allowedExtensions = ALLOWED_EXTENSIONS[declaredMimeType];
    if (!extension || !allowedExtensions.includes(extension)) {
      return { ok: false, code: 'type_not_allowed', error: 'Extension de fichier non autorisée.' };
    }

    if (input.header.length < MEDIA_HEADER_BYTES_REQUIRED) {
      return { ok: false, code: 'empty_or_corrupt', error: 'Fichier vide ou corrompu.' };
    }

    const detectedMimeType = detectMimeTypeFromMagicBytes(input.header.subarray(0, MEDIA_HEADER_BYTES_REQUIRED));
    if (!detectedMimeType || detectedMimeType !== declaredMimeType) {
      return { ok: false, code: 'content_mismatch', error: 'Le contenu du fichier ne correspond pas au type annoncé.' };
    }

    const mediaType = mediaKindForMimeType(declaredMimeType);
    if (!mediaType) {
      // Filet de sécurité : ne devrait jamais se produire, declaredMimeType
      // est déjà garanti valide par isAllowedMimeType ci-dessus.
      return { ok: false, code: 'unknown_error', error: GENERIC_ERROR };
    }

    return { ok: true, mediaType, mimeType: declaredMimeType };
  } catch {
    // Ne jamais laisser fuiter le détail d'une exception inattendue (entrée
    // malformée, etc.) : erreur générique, jamais le message brut de
    // l'exception, qui pourrait référencer des détails internes.
    return { ok: false, code: 'unknown_error', error: GENERIC_ERROR };
  }
}
