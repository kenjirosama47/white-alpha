/**
 * Détection de plateforme/navigateur pour la page `/install` (Phase 8.7).
 * Fonctions pures, testables sans DOM : le composant appelant fournit
 * `navigator.userAgent`/`navigator.maxTouchPoints` explicitement, jamais lu
 * ici directement (indisponible pendant le rendu serveur de toute façon).
 */

export type DetectedPlatform = 'android' | 'ios' | 'other';

/** iPadOS 13+ envoie un user-agent "Macintosh" classique (Safari desktop-like) : seul `maxTouchPoints` le distingue d'un vrai Mac. */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): DetectedPlatform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  return 'other';
}

/** `display-mode: standalone` (tous navigateurs) ou `navigator.standalone` (uniquement Safari iOS, non standard mais seul indicateur fiable sur cette plateforme). */
export function isStandaloneDisplay(standaloneMediaQueryMatches: boolean, iosNavigatorStandalone: boolean): boolean {
  return standaloneMediaQueryMatches || iosNavigatorStandalone;
}

/** Safari réel : contient "Safari" mais aucun des tokens des navigateurs tiers sous iOS (qui embarquent tous le moteur WebKit imposé par Apple et incluent donc "Safari" dans leur UA). */
export function isSafari(userAgent: string): boolean {
  return /safari/i.test(userAgent) && !/crios|fxios|edgios|opios|chrome|android/i.test(userAgent);
}

export function isChromeOnIOS(userAgent: string): boolean {
  return /crios/i.test(userAgent);
}

/** Navigateurs intégrés (in-app browsers) de réseaux sociaux/messageries : `beforeinstallprompt` n'y est jamais déclenché, et Safari réel n'y est pas accessible sans "Ouvrir dans le navigateur". */
export function isInAppBrowser(userAgent: string): boolean {
  return /(fban|fbav|instagram|line\/|micromessenger|twitter|linkedinapp)/i.test(userAgent);
}
