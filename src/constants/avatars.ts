/**
 * Catalogue des avatars loups prédéfinis (Phase 7.1 — architecture uniquement,
 * voir PLAN.md). Assets locaux embarqués à l'application, jamais Supabase
 * Storage : aucun téléchargement, fonctionnement hors connexion, chargement
 * immédiat, aucune URL publique, même rendu pour tous les utilisateurs.
 *
 * Seul un identifiant stable (`WolfAvatarId`) est destiné à être stocké côté
 * profil (futur, Phase 7.5) — jamais un chemin de fichier ni une URL. Le
 * client résout localement l'identifiant vers l'image correspondante.
 *
 * Le loup officiel du branding (bandeau, œil vert, forêt brumeuse) n'entre
 * jamais dans ce catalogue : il reste réservé à l'identité de l'application,
 * jamais un avatar utilisateur ordinaire.
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

export type WolfAvatarCatalogEntry = {
  id: WolfAvatarId;
  /** Libellé affiché dans la galerie de sélection (jamais utilisé comme identifiant de stockage). */
  label: string;
};

export const WOLF_AVATAR_CATALOG: readonly WolfAvatarCatalogEntry[] = [
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

export const DEFAULT_WOLF_AVATAR_ID: WolfAvatarId = 'wolf_white_calm';

/**
 * Images définitives ajoutées en Phase 7.2/7.5 (`assets/images/avatars/*.png`
 * + `require(...)` explicite par clé — jamais un chemin dynamique, pour que
 * Metro puisse résoudre chaque asset statiquement). Tant qu'une entrée est
 * absente, `resolveWolfAvatarSource` renvoie `null` : `AvatarImage` retombe
 * sur son repli existant (initiale), jamais une erreur de bundling sur un
 * asset manquant.
 */
const WOLF_AVATAR_SOURCES: Partial<Record<WolfAvatarId, number>> = {
  wolf_white_calm: require('../../assets/images/avatars/wolf_white_calm.png'),
  wolf_grey: require('../../assets/images/avatars/wolf_grey.png'),
  wolf_black: require('../../assets/images/avatars/wolf_black.png'),
  wolf_brown: require('../../assets/images/avatars/wolf_brown.png'),
  wolf_snow: require('../../assets/images/avatars/wolf_snow.png'),
  wolf_green_eye: require('../../assets/images/avatars/wolf_green_eye.png'),
  wolf_young: require('../../assets/images/avatars/wolf_young.png'),
  wolf_guardian: require('../../assets/images/avatars/wolf_guardian.png'),
  wolf_alpha: require('../../assets/images/avatars/wolf_alpha.png'),
};

export function resolveWolfAvatarSource(id: WolfAvatarId | null | undefined): number | null {
  if (!id) return null;
  return WOLF_AVATAR_SOURCES[id] ?? null;
}

export function isWolfAvatarId(value: string): value is WolfAvatarId {
  return WOLF_AVATAR_CATALOG.some((entry) => entry.id === value);
}

export function getWolfAvatarLabel(id: WolfAvatarId): string {
  return WOLF_AVATAR_CATALOG.find((entry) => entry.id === id)?.label ?? id;
}
