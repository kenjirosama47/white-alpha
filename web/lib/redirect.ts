/**
 * Valide qu'un paramètre `next` fourni par l'utilisateur (query string,
 * champ de formulaire caché) désigne bien un chemin interne au site — jamais
 * une redirection ouverte. `path.startsWith('/')` seul ne suffit pas : un
 * navigateur traite `//evil.example` (URL protocole-relative) comme externe,
 * tout comme `/\evil.example` sur certains moteurs de rendu — les deux sont
 * donc explicitement rejetés ici, en plus de toute forme contenant `://`.
 */
export function isSafeRedirectPath(path: string): path is string {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.startsWith('/\\')) return false;
  if (path.includes('://')) return false;
  return true;
}

export function sanitizeRedirectPath(path: string | null | undefined, fallback: string): string {
  if (path && isSafeRedirectPath(path)) return path;
  return fallback;
}
