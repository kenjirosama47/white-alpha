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
