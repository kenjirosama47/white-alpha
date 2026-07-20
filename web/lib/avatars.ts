/**
 * Catalogue des 9 avatars loups, porté depuis le projet mobile
 * (`src/constants/avatars.ts`) — mêmes identifiants stables, mêmes libellés.
 * Fichiers copiés dans `public/avatars/` (voir la note dans `theme.ts` sur
 * l'indépendance des deux dépôts de build). Non utilisé tant que la galerie
 * de profil n'existe pas côté web (Phase 8.2, fondation) — présent pour que
 * les futurs écrans authentifiés puissent le réutiliser sans dupliquer les
 * identifiants.
 */
export type WolfAvatarId =
  | 'wolf_white_calm'
  | 'wolf_grey'
  | 'wolf_black'
  | 'wolf_brown'
  | 'wolf_snow'
  | 'wolf_green_eye'
  | 'wolf_young'
  | 'wolf_guardian'
  | 'wolf_alpha';

export const WOLF_AVATAR_CATALOG: readonly { id: WolfAvatarId; label: string }[] = [
  { id: 'wolf_white_calm', label: 'Loup blanc calme' },
  { id: 'wolf_grey', label: 'Loup gris' },
  { id: 'wolf_black', label: 'Loup noir' },
  { id: 'wolf_brown', label: 'Loup brun' },
  { id: 'wolf_snow', label: 'Loup des neiges' },
  { id: 'wolf_green_eye', label: 'Loup au regard vert' },
  { id: 'wolf_young', label: 'Loup jeune' },
  { id: 'wolf_guardian', label: 'Loup protecteur' },
  { id: 'wolf_alpha', label: 'Loup alpha' },
] as const;

export function wolfAvatarSrc(id: WolfAvatarId): string {
  return `/avatars/${id}.png`;
}

const WOLF_AVATAR_IDS = new Set<string>(WOLF_AVATAR_CATALOG.map((entry) => entry.id));

export function isWolfAvatarId(value: string | null | undefined): value is WolfAvatarId {
  return !!value && WOLF_AVATAR_IDS.has(value);
}

/**
 * Résolution centrale de l'avatar affiché (Phase 8.4) — port exact de
 * `src/utils/avatar-resolution.ts` (mobile) : photo personnelle si
 * `avatarUrl` est réellement valide (jamais une chaîne vide, "null",
 * "undefined", ou une URL qui ne parse pas en http(s)), sinon avatar loup
 * prédéfini, sinon repli sur l'initiale. Utilisée exclusivement par
 * `components/Avatar.tsx` — jamais dupliquée ailleurs (liste des
 * conversations, recherche, en-tête de discussion).
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

export type AvatarDisplay = { kind: 'photo'; uri: string } | { kind: 'wolf'; src: string } | { kind: 'initial' };

export function resolveAvatarDisplay(
  avatarUrl: string | null | undefined,
  avatarPreset: string | null | undefined,
): AvatarDisplay {
  if (isValidAvatarUrl(avatarUrl)) {
    return { kind: 'photo', uri: avatarUrl };
  }
  if (isWolfAvatarId(avatarPreset)) {
    return { kind: 'wolf', src: wolfAvatarSrc(avatarPreset) };
  }
  return { kind: 'initial' };
}

/**
 * URL publique stable du bucket `avatars` (public par conception, voir
 * `src/services/avatars.ts` mobile) : jamais un appel réseau, jamais de
 * signature/expiration. `storagePath` est un chemin Storage
 * (`user_id/uuid.ext`), jamais une URL complète — c'est exactement ce que
 * renvoient `search_public_profiles`/`list_my_conversations`/
 * `get_conversation_for_notification` dans `other_avatar_url`. Construction
 * identique à `StorageFileApi.getPublicUrl` du SDK officiel (vérifié dans
 * `node_modules/@supabase/storage-js`, jamais un appel réseau réel) :
 * `${url}/storage/v1/object/public/${bucket}/${path}`, passé par
 * `encodeURI`.
 */
export function getAvatarPublicUrl(supabaseUrl: string, storagePath: string): string {
  return encodeURI(`${supabaseUrl}/storage/v1/object/public/avatars/${storagePath}`);
}
