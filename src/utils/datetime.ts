/** Formate un horodatage ISO en heure locale courte (ex. "14:32"). */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
