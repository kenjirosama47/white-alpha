/**
 * URL de téléchargement de l'APK Release signé — jamais l'APK lui-même dans
 * ce dépôt (Phase 8.2, section 4). Reste `null` tant qu'un emplacement de
 * publication séparé et sécurisé n'a pas été mis en place (Phase 8.6) : le
 * bouton Android affiche alors « Bientôt disponible », jamais un lien mort.
 */
export const ANDROID_APK_DOWNLOAD_URL: string | null = null;

export const ANDROID_APK_META = {
  version: null as string | null,
  buildDate: null as string | null,
  sizeBytes: null as number | null,
  sha256: null as string | null,
};
