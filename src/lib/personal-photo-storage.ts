import { Directory, File, Paths } from 'expo-file-system';

import { PERSONAL_PHOTOS_DIRNAME } from '@/constants/personal-photo';
import { logDebugEvent } from '@/lib/logger';

/**
 * UUID v4. Pas besoin d'aléa cryptographique ici : c'est uniquement un nom
 * de fichier privé à l'appareil, jamais une clé de sécurité (même principe
 * que dans `services/media.ts`/`services/avatars.ts`, non réutilisé ici
 * pour garder les domaines indépendants).
 */
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Répertoire privé de l'application (`Paths.document`, jamais un dossier
 * public/partagé, jamais accessible aux autres applications) : créé de
 * façon idempotente à chaque appel, jamais besoin de vérifier son
 * existence au préalable.
 */
function getPrivateDirectory(): Directory {
  const dir = new Directory(Paths.document, PERSONAL_PHOTOS_DIRNAME);
  try {
    dir.create({ intermediates: true, idempotent: true });
  } catch {
    logDebugEvent('[White Alpha][personal-photo] Création du dossier privé impossible.');
  }
  return dir;
}

/**
 * Déplace une photo déjà traitée (recadrée/compressée, voir
 * `services/personal-photo.ts`) depuis le cache temporaire vers le
 * stockage privé durable de l'application, sous un nom généré (jamais le
 * nom original du fichier source — jamais journalisé, jamais affiché).
 * Le fichier temporaire est supprimé après une copie réussie (aucun
 * fichier source temporaire ne doit subsister).
 */
export async function savePersonalPhotoFile(temporaryUri: string): Promise<string> {
  const directory = getPrivateDirectory();
  const destination = new File(directory, `${uuidv4()}.jpg`);
  const source = new File(temporaryUri);

  await source.copy(destination, { overwrite: true });

  try {
    if (source.exists) source.delete();
  } catch {
    // Best-effort : un résidu dans le cache n'est jamais une fuite de
    // confidentialité (toujours dans le bac à sable de l'app), seulement
    // un peu d'espace non libéré immédiatement.
    logDebugEvent('[White Alpha][personal-photo] Suppression du fichier temporaire impossible.');
  }

  return destination.uri;
}

/**
 * `true` si le fichier référencé par `localUri` existe encore et est
 * lisible. Vérification synchrone (API `expo-file-system` moderne) :
 * jamais d'erreur levée même pour une URI invalide ou un fichier
 * totalement absent (repli sur `false`).
 */
export function personalPhotoFileExists(localUri: string): boolean {
  try {
    return new File(localUri).exists;
  } catch {
    return false;
  }
}

/**
 * Suppression définitive locale, best-effort (jamais d'erreur propagée) :
 * utilisée aussi bien pour un remplacement, une suppression explicite que
 * pour l'annulation d'un aperçu non confirmé.
 */
export async function deletePersonalPhotoFile(localUri: string): Promise<void> {
  try {
    const file = new File(localUri);
    if (file.exists) file.delete();
  } catch {
    logDebugEvent('[White Alpha][personal-photo] Suppression du fichier privé impossible.');
  }
}
