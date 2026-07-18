import { resolveWolfAvatarSource, type WolfAvatarId } from '@/constants/avatars';

/**
 * Valide `avatarUrl` avant de le laisser primer sur `avatarPreset` (Anomalie
 * 1, build 16) : une chaîne vide/blanche, les littéraux `"null"`/`"undefined"`
 * (jamais censés arriver, mais déjà vus provenir d'une conversion de valeur
 * absente côté route params, qui ne connaissent que des chaînes) ou une URL
 * qui ne parse pas en http(s) ne doivent jamais empêcher l'avatar loup de
 * s'afficher.
 */
export function isValidAvatarUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export type AvatarDisplay =
  | { kind: 'photo'; uri: string }
  | { kind: 'wolf'; source: number }
  | { kind: 'initial' };

/**
 * Résolution centralisée de l'avatar affiché, utilisée uniquement par
 * `AvatarImage` (composant partagé par tous les écrans, jamais dupliquée
 * ailleurs) : photo personnelle si `avatarUrl` est réellement valide, sinon
 * avatar loup prédéfini si `avatarPreset` correspond à un des 9 avatars
 * locaux, sinon repli sur l'initiale.
 */
export function resolveAvatarDisplay(
  avatarUrl: string | null | undefined,
  wolfPreset: WolfAvatarId | null | undefined,
): AvatarDisplay {
  if (isValidAvatarUrl(avatarUrl)) {
    return { kind: 'photo', uri: avatarUrl };
  }
  const wolfSource = resolveWolfAvatarSource(wolfPreset);
  if (wolfSource) {
    return { kind: 'wolf', source: wolfSource };
  }
  return { kind: 'initial' };
}
