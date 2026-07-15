/** Formate une durée en millisecondes en "m:ss" (ex. 45000 -> "0:45"). */
export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Formate une taille de fichier en octets en Ko/Mo lisibles (ex. 12582912 -> "12 Mo"). */
export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} Ko`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} Mo`;
}
