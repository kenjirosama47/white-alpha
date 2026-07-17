/**
 * Journalisation minimale, jamais de valeur sensible : uniquement des
 * messages fixes/catégories, jamais un jeton, un mot de passe, un secret
 * TOTP, une URL signée, un contenu de message ou un email complet (Phase
 * 5.S5). Désactivée en Release (`__DEV__` fourni nativement par React
 * Native, `false` dans un bundle de production) : aucun `console.log`
 * n'atteint logcat sur un appareil de production. Comportement inchangé en
 * développement.
 */
export function logDebugEvent(message: string): void {
  if (__DEV__) {
    console.log(message);
  }
}
