/** Formate un horodatage ISO en heure locale courte (ex. "14:32"). */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** `true` si les deux horodatages ISO tombent le même jour, en heure locale. */
export function isSameLocalDay(isoA: string, isoB: string): boolean {
  const a = new Date(isoA);
  const b = new Date(isoB);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Texte du séparateur de date affiché entre deux messages (écran de
 * discussion, Phase 7.4) : « Aujourd'hui », « Hier », ou une date complète.
 * Purement dérivé de `createdAt` côté client — n'introduit aucune nouvelle
 * donnée ni requête.
 */
export function formatDateSeparator(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameLocalDay(iso, now.toISOString())) {
    return "Aujourd'hui";
  }
  if (isSameLocalDay(iso, yesterday.toISOString())) {
    return 'Hier';
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}
